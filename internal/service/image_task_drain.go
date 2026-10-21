package service

import (
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

const (
	ImageTaskAdmissionCodeDraining = "service_draining"
	ImageTaskAdmissionCodeClosing  = "service_closing"
)

// ImageTaskAdmissionError is returned when the service intentionally stops
// accepting new creation work. The stable code lets HTTP clients distinguish
// a temporary update drain from validation and capacity failures.
type ImageTaskAdmissionError struct {
	Code    string
	Message string
}

func (e ImageTaskAdmissionError) Error() string { return e.Message }

type ImageTaskDrainSnapshot struct {
	Accepting bool   `json:"accepting"`
	Draining  bool   `json:"draining"`
	Drained   bool   `json:"drained"`
	Queued    int    `json:"queued"`
	Running   int    `json:"running"`
	Active    int    `json:"active"`
	Reason    string `json:"reason,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
}

// BeginDrain atomically closes task admission while allowing already accepted
// work to finish. Repeated calls preserve the original drain start time.
func (s *ImageTaskService) BeginDrain(reason string) ImageTaskDrainSnapshot {
	if s == nil {
		return ImageTaskDrainSnapshot{Draining: true, Drained: true, Reason: "创作任务服务未初始化"}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.draining {
		s.draining = true
		s.drainStartedAt = util.NowLocal()
	}
	if cleaned := strings.TrimSpace(reason); cleaned != "" {
		s.drainReason = cleaned
	} else if s.drainReason == "" {
		s.drainReason = "服务更新中，暂不接收新的创作任务"
	}
	return s.drainSnapshotLocked()
}

// ResumeAdmission reopens task admission after an aborted update. A process
// already closing cannot be resumed.
func (s *ImageTaskService) ResumeAdmission() (ImageTaskDrainSnapshot, error) {
	if s == nil {
		return ImageTaskDrainSnapshot{}, fmt.Errorf("创作任务服务未初始化")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return s.drainSnapshotLocked(), ImageTaskAdmissionError{Code: ImageTaskAdmissionCodeClosing, Message: "服务正在关闭，无法恢复接单"}
	}
	if !s.storeReady {
		return s.drainSnapshotLocked(), fmt.Errorf("创作任务数据未成功加载，无法恢复接单")
	}
	s.draining = false
	s.drainReason = ""
	s.drainStartedAt = ""
	return s.drainSnapshotLocked(), nil
}

func (s *ImageTaskService) DrainSnapshot() ImageTaskDrainSnapshot {
	if s == nil {
		return ImageTaskDrainSnapshot{Draining: true, Drained: true, Reason: "创作任务服务未初始化"}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.drainSnapshotLocked()
}

func (s *ImageTaskService) drainSnapshotLocked() ImageTaskDrainSnapshot {
	snapshot := ImageTaskDrainSnapshot{
		Accepting: !s.draining && !s.closing && s.storeReady,
		Draining:  s.draining || s.closing,
		Reason:    s.drainReason,
		StartedAt: s.drainStartedAt,
	}
	if s.closing {
		snapshot.Reason = "服务正在关闭"
	}
	for _, task := range s.tasks {
		if task == nil {
			continue
		}
		switch strings.TrimSpace(task.Status) {
		case TaskStatusQueued:
			snapshot.Queued++
		case TaskStatusRunning:
			snapshot.Running++
		}
	}
	snapshot.Active = snapshot.Queued + snapshot.Running
	snapshot.Drained = snapshot.Active == 0
	return snapshot
}
