package service

import (
	"chatgpt2api/internal/util"
	"context"
	"fmt"
	"strings"
	"time"
)

const (
	imageTaskChannelGPT  = "gpt"
	imageTaskChannelGrok = "grok"
	videoTaskMinTimeout  = 5 * time.Minute
)

// imageTaskChannel maps a request model onto an independent concurrency pool.
// The task service also accepts frozen channel ids for configured relays.
func imageTaskChannel(model string) string {
	if util.IsGrokImageModel(model) {
		return imageTaskChannelGrok
	}
	return imageTaskChannelGPT
}

func (s *ImageTaskService) acquireImageSlots(ctx context.Context, requested int, channel string, configuredChannelLimit ...int) (int, bool) {
	if requested < 1 {
		requested = 1
	}
	channel = strings.TrimSpace(channel)
	if channel == "" {
		channel = imageTaskChannelGPT
	}
	for {
		globalCap := s.imageConcurrentLimit()
		limit := globalCap
		if len(configuredChannelLimit) > 0 && configuredChannelLimit[0] > 0 && configuredChannelLimit[0] < limit {
			limit = configuredChannelLimit[0]
		}
		slots := requested
		if slots > limit {
			slots = limit
		}
		s.mu.Lock()
		if s.runningByChannel == nil {
			s.runningByChannel = map[string]int{}
		}
		running := s.runningByChannel[channel]
		// Each frozen channel owns its own task-level capacity. The legacy
		// global setting remains the default for local account-pool work and
		// for relays without an explicit channel limit, but it must not gate a
		// different channel that still has capacity.
		if running+slots <= limit {
			s.runningByChannel[channel] = running + slots
			s.mu.Unlock()
			return slots, true
		}
		if s.slotChanged == nil {
			s.slotChanged = make(chan struct{})
		}
		changed := s.slotChanged
		s.mu.Unlock()

		// Releases wake waiters immediately. The bounded retry keeps runtime
		// concurrency-limit increases visible even when no task releases a slot.
		retry := time.NewTimer(time.Second)
		select {
		case <-ctx.Done():
			retry.Stop()
			return 0, false
		case <-changed:
			retry.Stop()
		case <-retry.C:
		}
	}
}

// imageTaskGlobalCap is retained for callers/tests as the normalized default
// channel limit. The scheduler no longer aggregates different frozen channels.
func imageTaskGlobalCap(perChannelLimit int) int {
	if perChannelLimit < 1 {
		return 1
	}
	return perChannelLimit
}

func (s *ImageTaskService) releaseImageSlots(slots int, channel string) {
	if slots < 1 {
		return
	}
	channel = strings.TrimSpace(channel)
	if channel == "" {
		channel = imageTaskChannelGPT
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.runningByChannel == nil {
		s.runningByChannel = map[string]int{}
	}
	s.runningByChannel[channel] -= slots
	if s.runningByChannel[channel] < 0 {
		s.runningByChannel[channel] = 0
	}
	s.notifyImageSlotWaitersLocked()
}

func (s *ImageTaskService) notifyImageSlotWaitersLocked() {
	if s.slotChanged != nil {
		close(s.slotChanged)
	}
	s.slotChanged = make(chan struct{})
}

func (s *ImageTaskService) imageConcurrentLimit() int {
	limit := 4
	if s.concurrentLimit != nil {
		limit = s.concurrentLimit()
	}
	if limit < 1 {
		return 1
	}
	return limit
}

// imageTaskSlotRequest returns request-level slots rather than blindly using
// N. GPT already schedules each output independently; only Grok's explicitly
// enabled parallel runtime should reserve multiple slots for one task.
func (s *ImageTaskService) imageTaskSlotRequest(payload map[string]any, channel string) int {
	if channel != imageTaskChannelGrok || s.imageParallelGeneration == nil || !s.imageParallelGeneration() {
		return 1
	}
	requested := imageTaskCount(payload)
	limit := s.imageConcurrentLimit()
	if requested > limit {
		return limit
	}
	if requested < 1 {
		return 1
	}
	return requested
}

func (s *ImageTaskService) taskTimeout() time.Duration {
	if s.taskTimeoutGetter == nil {
		return defaultImageTaskTimeout
	}
	timeout := s.taskTimeoutGetter()
	if timeout <= 0 {
		return defaultImageTaskTimeout
	}
	return timeout
}

func (s *ImageTaskService) taskTimeoutForMode(mode string) time.Duration {
	timeout := s.taskTimeout()
	if mode == "video" && timeout < videoTaskMinTimeout {
		return videoTaskMinTimeout
	}
	return timeout
}

// taskTimeoutForPayload uses the route snapshot captured at submission time.
// Requests without a channel model keep the legacy global timeout contract.
func (s *ImageTaskService) taskTimeoutForPayload(mode string, payload map[string]any) time.Duration {
	if mode != "video" && isImageTaskMode(mode) {
		seconds := util.ToInt(payload["channel_timeout_seconds"], 0)
		if seconds >= 30 && seconds <= 3600 {
			return time.Duration(seconds) * time.Second
		}
	}
	return s.taskTimeoutForMode(mode)
}

func (s *ImageTaskService) checkUserTaskLimitsLocked(identity Identity, owner string, requested int, mode string, payload map[string]any, now time.Time) error {
	if identity.Role != AuthRoleUser {
		return nil
	}
	if requested < 1 {
		requested = 1
	}
	lane := imageTaskLane(mode, payload)
	if limit := s.userImageConcurrentLimit(); limit > 0 && s.activeOwnerTaskCountLocked(owner, lane)+requested > limit {
		return ImageTaskLimitError{Message: fmt.Sprintf("用户并发限制已达到（最多 %d 个任务处理中）", limit)}
	}
	if limit := s.userImageRPMLimit(); limit > 0 {
		cutoff := now.Add(-time.Minute)
		times := s.ownerSubmitTimes[owner]
		kept := times[:0]
		for _, item := range times {
			if item.After(cutoff) {
				kept = append(kept, item)
			}
		}
		if len(kept) >= limit {
			s.ownerSubmitTimes[owner] = kept
			return ImageTaskLimitError{Message: fmt.Sprintf("用户 RPM 速率限制已达到（每分钟最多 %d 次）", limit)}
		}
		s.ownerSubmitTimes[owner] = append(kept, now)
	}
	return nil
}

func (s *ImageTaskService) activeOwnerTaskCountLocked(owner, lane string) int {
	count := 0
	for _, task := range s.tasks {
		if task.OwnerID != owner || !isActiveTaskStatus(util.Clean(task.Status)) {
			continue
		}
		if imageTaskLaneFromRecord(task) == lane {
			count += storedTaskCount(task)
		}
	}
	return count
}

func (s *ImageTaskService) userImageConcurrentLimit() int {
	if s.userConcurrentLimit == nil {
		return 0
	}
	limit := s.userConcurrentLimit()
	if limit < 1 {
		return 0
	}
	return limit
}

func (s *ImageTaskService) userImageRPMLimit() int {
	if s.userRPMLimit == nil {
		return 0
	}
	limit := s.userRPMLimit()
	if limit < 1 {
		return 0
	}
	return limit
}

func (s *ImageTaskService) updateActiveTask(key string, updates map[string]any) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil {
		return false
	}
	if !isActiveTaskStatus(util.Clean(task.Status)) {
		return false
	}
	task.applyUpdates(updates)
	task.UpdatedAt = util.NowLocal()
	// Progress updates are frequent; coalesce disk writes of this task row only.
	s.scheduleSaveLocked(key)
	s.notifySubscribersLocked()
	return true
}

func (s *ImageTaskService) removeTaskCancel(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cancels, key)
}
