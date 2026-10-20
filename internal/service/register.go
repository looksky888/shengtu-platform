package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"context"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	registerModeTotal     = "total"
	registerModeQuota     = "quota"
	registerModeAvailable = "available"

	registerAuthBase                 = "https://auth.openai.com"
	registerPlatformBase             = "https://platform.openai.com"
	registerPlatformOAuthClientID    = "app_2SKx67EdpoN0G6j64rFvigXD"
	registerPlatformOAuthRedirectURI = registerPlatformBase + "/auth/callback"
	registerPlatformOAuthAudience    = "https://api.openai.com/v1"
	registerPlatformAuth0Client      = "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjEuMjEuMCJ9"
	registerUserAgent                = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
	registerSecCHUA                  = `"Google Chrome";v="145", "Not?A_Brand";v="8", "Chromium";v="145"`
	registerSecCHUAFullVersionList   = `"Chromium";v="145.0.0.0", "Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.0.0"`
	registerSentinelBase             = "https://sentinel.openai.com"
	registerSentinelSDK              = registerSentinelBase + "/sentinel/20260124ceb8/sdk.js"
	registerSentinelMaxAttempts      = 500000
	registerSentinelErrorPrefix      = "wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D"
)

var (
	registerFirstNames = []string{"James", "Robert", "John", "Michael", "David", "Mary", "Emma", "Olivia"}
	registerLastNames  = []string{"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller"}
)

type RegisterService struct {
	mu          sync.Mutex
	path        string
	store       storage.JSONDocumentBackend
	docName     string
	accounts    *AccountService
	config      RegisterConfig
	logs        []RegisterLog
	runnerAlive bool
	subscribers map[chan string]struct{}
	storeReady  bool
}

type registerWorkerResult struct {
	ok     bool
	index  int
	result map[string]any
	err    string
	cost   float64
}

type registerWorker struct {
	service              *RegisterService
	index                int
	config               map[string]any
	mail                 map[string]any
	client               *http.Client
	deviceID             string
	platformCodeVerifier string
	platformAuthCode     string
	clearanceUserAgent   string
	accountContinueURL   string
	// passwordlessSignup is set after platform authorize (or passwordless/send-otp).
	// OpenAI's current signup flow sends email OTP without user/register.
	passwordlessSignup bool
	lastFinalURL       string
}

type registerSentinelTokenGenerator struct {
	deviceID  string
	userAgent string
	sid       string
}

func NewRegisterService(dataDir string, accounts *AccountService, backend ...storage.Backend) *RegisterService {
	InitOutlookTokenStatePath(dataDir)
	s := &RegisterService{
		path:        filepath.Join(dataDir, "register.json"),
		store:       firstJSONDocumentStore(backend),
		docName:     "register.json",
		accounts:    accounts,
		config:      registerDefaultConfig(),
		subscribers: map[chan string]struct{}{},
	}
	s.config, s.storeReady = s.load()
	if s.config.Enabled {
		if err := s.startLocked(false); err != nil {
			log.Printf("restore register worker failed: %v", err)
		}
	}
	return s
}

func (s *RegisterService) Get() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.snapshotLocked()
}

// workerConfig returns a deep-enough clone of live config for registration workers.
// Unlike Get(), this path always keeps outlook mailboxes secrets for CreateMailbox.
func (s *RegisterService) workerConfig() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.config.toMap()
	mail := util.StringMap(out["mail"])
	providers := util.AsMapSlice(mail["providers"])
	copied := make([]map[string]any, 0, len(providers))
	for _, provider := range providers {
		copied = append(copied, util.CopyMap(provider))
	}
	mail["providers"] = copied
	out["mail"] = mail
	return out
}

func (s *RegisterService) Update(updates map[string]any) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := normalizeRegisterConfig(s.config.toMap())
	s.mergeOutlookPoolsLocked(updates)
	// The API snapshot hides credentials, so an incoming blank secret means
	// "unchanged" rather than "clear it".
	updates = preserveRegisterStoredSecrets(s.config.toMap(), updates)
	s.config = normalizeRegisterConfig(mergeMaps(s.config.toMap(), updates))
	if err := s.saveLocked(); err != nil {
		s.config = previous
		return nil, fmt.Errorf("保存注册配置失败: %w", err)
	}
	s.notifyLocked()
	return s.snapshotLocked(), nil
}

// ResetOutlookPool resets outlook_token pool state or prunes unused credentials.
// scope: all | failed | unused
func (s *RegisterService) ResetOutlookPool(scope string) (map[string]any, error) {
	scope = strings.ToLower(strings.TrimSpace(scope))
	if scope == "unused" {
		s.mu.Lock()
		defer s.mu.Unlock()
		previous := normalizeRegisterConfig(s.config.toMap())
		removed, err := s.pruneUnusedOutlookPoolsLocked()
		if err != nil {
			return nil, fmt.Errorf("读取 OutlookToken 状态失败: %w", err)
		}
		if err := s.saveLocked(); err != nil {
			s.config = previous
			return nil, fmt.Errorf("保存注册配置失败: %w", err)
		}
		s.appendLogLocked(fmt.Sprintf("已清空 Outlook 邮箱池未使用邮箱，移除 %d 个", removed), "yellow")
		s.notifyLocked()
		return s.snapshotLocked(), nil
	}
	if scope != "failed" {
		scope = "all"
	}
	cleared, err := ResetOutlookTokenPoolState(scope)
	if err != nil {
		return nil, fmt.Errorf("重置 OutlookToken 状态失败: %w", err)
	}
	s.mu.Lock()
	label := "全部"
	if scope == "failed" {
		label = "仅失败/占用"
	}
	s.appendLogLocked(fmt.Sprintf("已重置 Outlook 邮箱池状态（范围=%s），清除 %d 条记录", label, cleared), "yellow")
	s.notifyLocked()
	out := s.snapshotLocked()
	s.mu.Unlock()
	return out, nil
}

func (s *RegisterService) Start() (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.startLocked(true); err != nil {
		return nil, err
	}
	return s.snapshotLocked(), nil
}

func (s *RegisterService) Stop() (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previousConfig := normalizeRegisterConfig(s.config.toMap())
	previousLogs := append([]RegisterLog(nil), s.logs...)
	s.config.Enabled = false
	s.config.Stats.UpdatedAt = util.NowISO()
	s.appendLogLocked("已请求停止注册任务，正在等待当前运行任务结束", "yellow")
	if err := s.saveLocked(); err != nil {
		s.config = previousConfig
		s.logs = previousLogs
		return nil, fmt.Errorf("保存注册停止状态失败: %w", err)
	}
	s.notifyLocked()
	return s.snapshotLocked(), nil
}

func (s *RegisterService) Reset() (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previousConfig := normalizeRegisterConfig(s.config.toMap())
	previousLogs := append([]RegisterLog(nil), s.logs...)
	s.logs = nil
	s.config.Stats = registerZeroStats(s.config.Threads, s.poolMetricsLocked())
	if err := s.saveLocked(); err != nil {
		s.config = previousConfig
		s.logs = previousLogs
		return nil, fmt.Errorf("保存注册重置状态失败: %w", err)
	}
	s.notifyLocked()
	return s.snapshotLocked(), nil
}

func (s *RegisterService) Subscribe(ctx context.Context) <-chan string {
	ch := make(chan string, 8)
	s.mu.Lock()
	s.subscribers[ch] = struct{}{}
	initial := s.snapshotJSONLocked()
	s.mu.Unlock()
	ch <- initial
	go func() {
		<-ctx.Done()
		s.mu.Lock()
		delete(s.subscribers, ch)
		s.mu.Unlock()
		close(ch)
	}()
	return ch
}

func (s *RegisterService) Events(ctx context.Context) <-chan string {
	return s.Subscribe(ctx)
}

func (s *RegisterService) SnapshotJSON() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.snapshotJSONLocked()
}

func (s *RegisterService) startLocked(resetLogs bool) error {
	previousConfig := normalizeRegisterConfig(s.config.toMap())
	previousLogs := append([]RegisterLog(nil), s.logs...)
	if s.runnerAlive {
		s.config.Enabled = true
		if err := s.saveLocked(); err != nil {
			s.config = previousConfig
			return fmt.Errorf("保存注册启动状态失败: %w", err)
		}
		s.notifyLocked()
		return nil
	}
	if resetLogs {
		s.logs = nil
	}
	s.config.Enabled = true
	stats := registerZeroStats(s.config.Threads, s.poolMetricsLocked())
	stats.JobID = util.NewHex(32)
	stats.StartedAt = util.NowISO()
	stats.UpdatedAt = util.NowISO()
	s.config.Stats = stats
	if err := s.saveLocked(); err != nil {
		s.config = previousConfig
		s.logs = previousLogs
		return fmt.Errorf("保存注册启动状态失败: %w", err)
	}
	s.runnerAlive = true
	s.notifyLocked()
	mode := util.Clean(s.config.Mode)
	if mode == "" {
		mode = registerModeTotal
	}
	s.appendLogLocked(fmt.Sprintf("注册任务启动，模式=%s，线程数=%d", mode, s.config.Threads), "yellow")
	go s.run()
	return nil
}

func (s *RegisterService) run() {
	cfg := s.workerConfig()
	threads := maxInt(1, util.ToInt(cfg["threads"], 1))
	submitted, running, done, success, fail := 0, 0, 0, 0, 0
	results := make(chan registerWorkerResult, threads)
	for {
		current := s.workerConfig()
		for util.ToBool(current["enabled"]) && !s.targetReached(current, submitted) && running < threads {
			submitted++
			running++
			// Always clone from unredacted workerConfig so outlook mailboxes stay populated.
			workerCfg := cloneMap(current)
			workerCfg["mail"] = cloneMap(util.StringMap(current["mail"]))
			// Deep-copy providers so concurrent workers don't share mutable entry maps.
			if mail := util.StringMap(workerCfg["mail"]); len(mail) > 0 {
				providers := util.AsMapSlice(mail["providers"])
				copied := make([]map[string]any, 0, len(providers))
				for _, provider := range providers {
					copied = append(copied, util.CopyMap(provider))
				}
				mail["providers"] = copied
				workerCfg["mail"] = mail
			}
			go func(index int, config map[string]any) {
				results <- s.runWorker(index, config)
			}(submitted, workerCfg)
			current = s.workerConfig()
		}
		s.bumpStats(map[string]any{"running": running, "done": done, "success": success, "fail": fail})
		if running == 0 {
			mode := util.Clean(current["mode"])
			if !util.ToBool(current["enabled"]) || mode == "" || mode == registerModeTotal {
				break
			}
			time.Sleep(time.Duration(maxInt(1, util.ToInt(current["check_interval"], 5))) * time.Second)
			continue
		}
		res := <-results
		running--
		done++
		if res.ok {
			success++
		} else {
			fail++
		}
	}
	s.bumpStats(map[string]any{"running": 0, "done": done, "success": success, "fail": fail, "finished_at": util.NowISO()})
	s.mu.Lock()
	s.runnerAlive = false
	s.config.Enabled = false
	if err := s.saveLocked(); err != nil {
		log.Printf("persist register completion failed: %v", err)
	}
	s.notifyLocked()
	s.appendLogLocked(fmt.Sprintf("注册任务结束，成功%d，失败%d", success, fail), "yellow")
	s.mu.Unlock()
}

func (s *RegisterService) runWorker(index int, config map[string]any) registerWorkerResult {
	start := time.Now()
	worker, err := newRegisterWorker(s, index, config)
	if err != nil {
		s.appendLog(fmt.Sprintf("任务%d 初始化失败，原因: %v", index, err), "red")
		return registerWorkerResult{ok: false, index: index, err: err.Error(), cost: time.Since(start).Seconds()}
	}
	defer worker.close()
	s.appendLog(fmt.Sprintf("[任务%d] 任务启动", index), "")
	result, runErr := worker.run(context.Background())
	cost := time.Since(start).Seconds()
	if runErr != nil {
		s.appendLog(fmt.Sprintf("任务%d 注册失败，本次耗时%.1fs，原因: %v", index, cost, runErr), "red")
		return registerWorkerResult{ok: false, index: index, err: runErr.Error(), cost: cost}
	}
	accessToken := util.Clean(result["access_token"])
	if accessToken == "" {
		err = fmt.Errorf("注册流程未返回 access_token")
		s.appendLog(fmt.Sprintf("任务%d 注册失败，本次耗时%.1fs，原因: %v", index, cost, err), "red")
		return registerWorkerResult{ok: false, index: index, err: err.Error(), cost: cost}
	}
	if err := s.persistAndRefreshRegisteredAccount(context.Background(), accessToken); err != nil {
		s.appendLog(fmt.Sprintf("任务%d 注册账号同步失败，本次耗时%.1fs，原因: %v", index, cost, err), "red")
		return registerWorkerResult{ok: false, index: index, result: result, err: err.Error(), cost: cost}
	}
	s.appendLog(fmt.Sprintf("%s 注册成功，本次耗时%.1fs", util.Clean(result["email"]), cost), "green")
	return registerWorkerResult{ok: true, index: index, result: result, cost: cost}
}

func (s *RegisterService) persistAndRefreshRegisteredAccount(ctx context.Context, accessToken string) error {
	if s.accounts == nil {
		return fmt.Errorf("账号服务未初始化")
	}
	addResult := s.accounts.AddAccounts([]string{accessToken})
	if message := util.Clean(addResult["error"]); message != "" {
		return fmt.Errorf("保存注册账号失败: %s", message)
	}
	refreshResult := s.accounts.RefreshAccounts(ctx, []string{accessToken})
	refreshErrors, ok := refreshResult["errors"].([]map[string]string)
	if ok && len(refreshErrors) > 0 {
		return fmt.Errorf("刷新注册账号失败: %s", refreshErrors[0]["error"])
	}
	return nil
}
