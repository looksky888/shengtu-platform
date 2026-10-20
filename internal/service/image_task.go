package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	TaskStatusQueued    = "queued"
	TaskStatusRunning   = "running"
	TaskStatusSuccess   = "success"
	TaskStatusError     = "error"
	TaskStatusCancelled = "cancelled"

	defaultImageTaskTimeout = 5 * time.Minute
)

type ImageTaskHandler func(context.Context, Identity, map[string]any) (map[string]any, error)

type ImageOutputOptions struct {
	Format      string
	Compression *int
}

type ImageTaskService struct {
	mu                  sync.RWMutex
	path                string
	store               storage.JSONDocumentBackend
	docName             string
	generation          ImageTaskHandler
	edit                ImageTaskHandler
	chat                ImageTaskHandler
	responseImage       ImageTaskHandler
	video               ImageTaskHandler
	terminalObserver    func(*ImageTask)
	retentionGetter     func() int
	concurrentLimit     func() int
	taskTimeoutGetter   func() time.Duration
	userConcurrentLimit func() int
	userRPMLimit        func() int
	// imageParallelGeneration reports whether the Grok runtime executes the
	// requested N images concurrently. GPT keeps one slot because its pool
	// implementation intentionally processes outputs one by one.
	imageParallelGeneration func() bool
	// workQueue bounds tasks waiting for a worker. The task record is persisted
	// before enqueueing, so a queued task remains observable across refreshes.
	workQueue          chan imageTaskWork
	relayWorkQueue     chan imageTaskWork
	videoWorkQueue     chan imageTaskWork
	workerStop         chan struct{}
	workerWG           sync.WaitGroup
	workersStarted     bool
	workerCount        int
	queueCapacity      int
	videoWorkerCount   int
	videoQueueCapacity int
	// runningByChannel tracks concurrent image slots per frozen route channel.
	// A channel's count is checked against its own limit; there is no aggregate
	// total across local account-pool and relay channels.
	runningByChannel map[string]int
	// slotChanged is replaced and closed on every release to wake blocked acquirers.
	slotChanged      chan struct{}
	tasks            map[string]*ImageTask
	cancels          map[string]context.CancelFunc
	ownerSubmitTimes map[string][]time.Time
	subscribers      map[chan string]struct{}
	// statsLedger is independent of tasks so clearing the queue does not erase admin stats.
	statsLedger *imageTaskStatsLedger
	// Stats writes are coalesced; failures keep dirty=true and schedule a retry.
	statsLedgerDirty     bool
	statsLedgerSaveTimer *time.Timer
	dirty                bool
	lastSaveAt           time.Time
	saveTimer            *time.Timer
	// dirtyKeys/removedKeys drive sharded persistence (only rewrite changed task rows).
	dirtyKeys   map[string]struct{}
	removedKeys map[string]struct{}
	indexDirty  bool
	// persistenceError is an admin-visible indication that the latest task/stat write failed.
	// Dirty state and retry timers remain the source of truth for eventual persistence.
	persistenceError string
	// storeReady is false when the initial load failed. Saves are refused so a
	// transient read error cannot wipe image_tasks with an empty document.
	storeReady bool
	// recoveredInterrupted holds tasks marked error on boot (queued/running at crash).
	// App drains these to refund credits for charges that may have completed before death.
	recoveredInterrupted []*ImageTask
	// Lifecycle: tasks inherit rootCtx; Close waits on taskWG (F-03).
	rootCtx    context.Context
	rootCancel context.CancelFunc
	taskWG     sync.WaitGroup
	closing    bool
}

// SetTerminalObserver registers a non-blocking observer for terminal task
// snapshots. The observer is invoked after durable task persistence and never
// runs while ImageTaskService.mu is held.
func (s *ImageTaskService) SetTerminalObserver(observer func(*ImageTask)) {
	s.mu.Lock()
	s.terminalObserver = observer
	s.mu.Unlock()
}

type imageTaskWork struct {
	ctx      context.Context
	key      string
	mode     string
	identity Identity
	payload  map[string]any
}

const (
	defaultImageTaskWorkers  = 8
	defaultImageTaskQueueCap = 256
	defaultVideoTaskWorkers  = 2
	defaultVideoTaskQueueCap = 64
)

type ImageTaskDailyStats struct {
	Date          string `json:"date"`
	Period        string `json:"period,omitempty"`
	StartDate     string `json:"start_date,omitempty"`
	EndDate       string `json:"end_date,omitempty"`
	SuccessTasks  int    `json:"success_tasks"`
	FailedTasks   int    `json:"failed_tasks"`
	SuccessImages int    `json:"success_images"`
	FailedImages  int    `json:"failed_images"`
	UpdatedAt     string `json:"updated_at"`
}

type ImageTaskLimitError struct {
	Message string
}

func (e ImageTaskLimitError) Error() string {
	return e.Message
}

type ImageTaskPersistenceError struct {
	Operation string
	Err       error
}

func (e *ImageTaskPersistenceError) Error() string {
	return e.Operation + "失败: " + e.Err.Error()
}

func (e *ImageTaskPersistenceError) Unwrap() error { return e.Err }

type ImageTaskIdempotencyConflictError struct{}

func (ImageTaskIdempotencyConflictError) Error() string {
	return "幂等键已被其他视频请求使用"
}

func NewImageTaskService(path string, generation ImageTaskHandler, edit ImageTaskHandler, chat ImageTaskHandler, retentionGetter func() int, limitGetters ...func() int) *ImageTaskService {
	return newImageTaskService(path, nil, generation, edit, chat, retentionGetter, limitGetters...)
}

func NewStoredImageTaskService(path string, backend storage.Backend, generation ImageTaskHandler, edit ImageTaskHandler, chat ImageTaskHandler, retentionGetter func() int, limitGetters ...func() int) *ImageTaskService {
	return newImageTaskService(path, jsonDocumentStoreFromBackend(backend), generation, edit, chat, retentionGetter, limitGetters...)
}

func newImageTaskService(path string, store storage.JSONDocumentBackend, generation ImageTaskHandler, edit ImageTaskHandler, chat ImageTaskHandler, retentionGetter func() int, limitGetters ...func() int) *ImageTaskService {
	s := &ImageTaskService{
		path: path, store: store, docName: "image_tasks.json",
		generation: generation, edit: edit, chat: chat, responseImage: generation,
		retentionGetter:  retentionGetter,
		runningByChannel: map[string]int{},
		slotChanged:      make(chan struct{}),
		tasks:            map[string]*ImageTask{},
		cancels:          map[string]context.CancelFunc{},
		ownerSubmitTimes: map[string][]time.Time{},
		subscribers:      map[chan string]struct{}{},
		dirtyKeys:        map[string]struct{}{},
		removedKeys:      map[string]struct{}{},
	}
	if len(limitGetters) > 0 {
		s.concurrentLimit = limitGetters[0]
	}
	if len(limitGetters) > 1 {
		s.userConcurrentLimit = limitGetters[1]
	}
	if len(limitGetters) > 2 {
		s.userRPMLimit = limitGetters[2]
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	s.mu.Lock()
	var tasksReady, statsReady bool
	s.tasks, tasksReady = s.loadLocked()
	s.statsLedger, statsReady = s.loadStatsLedgerLocked()
	s.storeReady = tasksReady && statsReady
	if s.storeReady {
		// Recovery runs first: backfill only counts terminal rows, so recovering
		// interrupted tasks afterwards would leave them out of the ledger forever.
		interrupted := s.recoverUnfinishedLocked()
		s.recoveredInterrupted = interrupted
		backfilled := s.backfillStatsLedgerFromTasksLocked()
		pruned := s.pruneStatsLedgerRecordedLocked()
		if backfilled > 0 || pruned > 0 {
			if err := s.flushStatsLedgerSaveLocked(); err != nil {
				log.Printf("image task startup stats persistence failed: %v", err)
			}
		}
		if s.cleanupLocked() || len(interrupted) > 0 {
			if err := s.saveLocked(); err != nil {
				log.Printf("image task startup state persistence failed: %v", err)
			}
		}
	}
	s.mu.Unlock()
	return s
}

// DrainRecoveredInterrupted returns tasks interrupted by the last process death (boot recovery)
// and clears the list. Call once after wiring credits to refund open charges.
func (s *ImageTaskService) DrainRecoveredInterrupted() []*ImageTask {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.recoveredInterrupted
	s.recoveredInterrupted = nil
	return out
}

// BillingRefForTask returns the deterministic credit ref used by creation-task image billing
// (endpoint + ":" + task id). Empty for non-billed modes (e.g. chat).
func BillingRefForTask(task *ImageTask) (endpoint, reason, refID string) {
	if task == nil {
		return "", "", ""
	}
	switch util.Clean(task.Mode) {
	case "edit":
		endpoint = "/api/creation-tasks/image-edits"
		reason = CreditReasonImageEdit
	case "response-image":
		endpoint = "/api/creation-tasks/response-image-generations"
		reason = CreditReasonImageGeneration
	case "generate":
		endpoint = "/api/creation-tasks/image-generations"
		reason = CreditReasonImageGeneration
	case "video":
		endpoint = "/api/creation-tasks/video-generations"
		reason = CreditReasonVideoGeneration
	default:
		return "", "", ""
	}
	refID = strings.Trim(endpoint, "/") + ":" + util.Clean(task.ID)
	return endpoint, reason, refID
}

func (s *ImageTaskService) SetResponseImageHandler(handler ImageTaskHandler) {
	if handler == nil {
		return
	}
	s.responseImage = handler
}

func (s *ImageTaskService) SetVideoHandler(handler ImageTaskHandler) {
	if handler == nil {
		return
	}
	s.video = handler
}

func (s *ImageTaskService) SetTaskTimeoutGetter(getter func() time.Duration) {
	if getter == nil {
		return
	}
	s.taskTimeoutGetter = getter
}

// SetImageParallelGenerationGetter lets the task scheduler account for the
// actual Grok runtime mode without coupling service to the HTTP/config layer.
func (s *ImageTaskService) SetImageParallelGenerationGetter(getter func() bool) {
	if getter == nil {
		return
	}
	s.mu.Lock()
	s.imageParallelGeneration = getter
	s.mu.Unlock()
}

// SetWorkerPoolConfig configures the bounded task executor. Call before
// BindRootContext or the first submission; runtime changes take effect after a
// service restart so in-flight queue ordering remains stable.
func (s *ImageTaskService) SetWorkerPoolConfig(workers, queueCapacity int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workersStarted {
		return
	}
	if workers > 0 {
		s.workerCount = workers
	}
	if queueCapacity > 0 {
		s.queueCapacity = queueCapacity
	}
}

// SetVideoWorkerPoolConfig configures a separate executor for long-running
// video tasks. It must be called before workers start, like SetWorkerPoolConfig.
func (s *ImageTaskService) SetVideoWorkerPoolConfig(workers, queueCapacity int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workersStarted {
		return
	}
	if workers > 0 {
		s.videoWorkerCount = workers
	}
	if queueCapacity > 0 {
		s.videoQueueCapacity = queueCapacity
	}
}
