package config

import (
	"sync"
	"time"
)

const imageCleanupMinInterval = time.Hour

type imageCleanupThrottleState struct {
	mu   sync.Mutex
	last time.Time
}

var imageCleanupThrottleByDataDir sync.Map

func (s *Store) CleanupOldImagesIfDue() int {
	stateValue, _ := imageCleanupThrottleByDataDir.LoadOrStore(s.DataDir, &imageCleanupThrottleState{})
	state := stateValue.(*imageCleanupThrottleState)
	now := time.Now()

	state.mu.Lock()
	if !state.last.IsZero() && now.Sub(state.last) < imageCleanupMinInterval {
		state.mu.Unlock()
		return 0
	}
	state.last = now
	state.mu.Unlock()

	return s.CleanupOldImages()
}
