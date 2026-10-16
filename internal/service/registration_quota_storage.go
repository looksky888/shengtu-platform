package service

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func emptyRegistrationQuotaState() registrationQuotaState {
	return registrationQuotaState{
		Events: []RegistrationQuotaEvent{}, Attempts: []RegistrationAttempt{}, Blocks: []RegistrationRiskBlock{},
	}
}

func (s *RegistrationQuotaService) load() (registrationQuotaState, error) {
	if s.store != nil {
		value, err := s.store.LoadJSONDocument(s.docName)
		if err != nil {
			return registrationQuotaState{}, fmt.Errorf("读取存储文档: %w", err)
		}
		if value != nil {
			state, ok := parseRegistrationQuotaState(value)
			if !ok {
				return registrationQuotaState{}, fmt.Errorf("存储文档格式无效")
			}
			return state, nil
		}
	}
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return emptyRegistrationQuotaState(), nil
		}
		return registrationQuotaState{}, fmt.Errorf("读取本地账本: %w", err)
	}
	var state registrationQuotaState
	if err := json.Unmarshal(data, &state); err != nil {
		return registrationQuotaState{}, fmt.Errorf("解析本地账本: %w", err)
	}
	normalizeRegistrationQuotaState(&state)
	if s.store != nil {
		if err := s.store.SaveJSONDocument(s.docName, state); err != nil {
			return registrationQuotaState{}, fmt.Errorf("迁移本地账本到存储文档: %w", err)
		}
	}
	return state, nil
}

func parseRegistrationQuotaState(value any) (registrationQuotaState, bool) {
	raw, err := json.Marshal(value)
	if err != nil {
		return registrationQuotaState{}, false
	}
	var state registrationQuotaState
	if json.Unmarshal(raw, &state) != nil {
		return registrationQuotaState{}, false
	}
	normalizeRegistrationQuotaState(&state)
	return state, true
}

func normalizeRegistrationQuotaState(state *registrationQuotaState) {
	if state.Events == nil {
		state.Events = []RegistrationQuotaEvent{}
	}
	if state.Attempts == nil {
		state.Attempts = []RegistrationAttempt{}
	}
	if state.Blocks == nil {
		state.Blocks = []RegistrationRiskBlock{}
	}
}

func (s *RegistrationQuotaService) saveLocked() error {
	s.pruneStateLocked(s.now())
	return s.persistLocked()
}

func (s *RegistrationQuotaService) persistLocked() error {
	normalizeRegistrationQuotaState(&s.state)
	if s.store != nil {
		if err := s.store.SaveJSONDocument(s.docName, s.state); err != nil {
			return err
		}
		_ = s.writeQuotaFileLocked()
		return nil
	}
	return s.writeQuotaFileLocked()
}

func (s *RegistrationQuotaService) writeQuotaFileLocked() error {
	data, err := json.Marshal(s.state)
	if err != nil {
		return err
	}
	return storage.AtomicWriteFile(s.path, append(data, '\n'), 0o600)
}

func (s *RegistrationQuotaService) pruneStateLocked(now time.Time) int {
	removed := s.pruneQuotaEventsLocked(now)
	removed += s.pruneRegistrationAttemptsLocked(now)
	removed += s.pruneRegistrationBlocksLocked(now)
	return removed
}

func (s *RegistrationQuotaService) pruneQuotaEventsLocked(now time.Time) int {
	retention := time.Duration(s.policy.DeviceWindowDays) * 24 * time.Hour
	if value := time.Duration(s.policy.IPWindowHours) * time.Hour; value > retention {
		retention = value
	}
	if value := time.Duration(s.policy.SubnetWindowHours) * time.Hour; value > retention {
		retention = value
	}
	cutoff := now.Add(-retention)
	reserveCutoff := now.Add(-staleReserveTTL)
	next := make([]RegistrationQuotaEvent, 0, len(s.state.Events))
	for _, event := range s.state.Events {
		createdAt := parseRegistrationQuotaTime(event.CreatedAt)
		if createdAt.IsZero() {
			continue
		}
		if strings.TrimSpace(event.ReserveID) != "" && util.Clean(event.UserID) == "" {
			if !createdAt.Before(reserveCutoff) {
				next = append(next, event)
			}
			continue
		}
		if !createdAt.Before(cutoff) {
			next = append(next, event)
		}
	}
	return replaceQuotaEvents(&s.state.Events, next, s.maxEvents)
}

func (s *RegistrationQuotaService) pruneRegistrationAttemptsLocked(now time.Time) int {
	retention := 24 * time.Hour
	if value := time.Duration(s.policy.PairAttemptWindowMinutes) * time.Minute; value > retention {
		retention = value
	}
	cutoff := now.Add(-retention)
	next := make([]RegistrationAttempt, 0, len(s.state.Attempts))
	for _, attempt := range s.state.Attempts {
		createdAt := parseRegistrationQuotaTime(attempt.CreatedAt)
		if !createdAt.IsZero() && !createdAt.Before(cutoff) {
			next = append(next, attempt)
		}
	}
	removed := len(s.state.Attempts) - len(next)
	if len(next) > s.maxEvents {
		removed += len(next) - s.maxEvents
		next = next[len(next)-s.maxEvents:]
	}
	s.state.Attempts = next
	return removed
}

func (s *RegistrationQuotaService) pruneRegistrationBlocksLocked(now time.Time) int {
	next := make([]RegistrationRiskBlock, 0, len(s.state.Blocks))
	for _, block := range s.state.Blocks {
		if parseRegistrationQuotaTime(block.ExpiresAt).After(now) {
			next = append(next, block)
		}
	}
	removed := len(s.state.Blocks) - len(next)
	if len(next) > s.maxEvents {
		removed += len(next) - s.maxEvents
		next = next[len(next)-s.maxEvents:]
	}
	s.state.Blocks = next
	return removed
}

func replaceQuotaEvents(target *[]RegistrationQuotaEvent, next []RegistrationQuotaEvent, max int) int {
	removed := len(*target) - len(next)
	if len(next) > max {
		removed += len(next) - max
		next = next[len(next)-max:]
	}
	*target = next
	return removed
}

func parseRegistrationQuotaTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsed
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed
	}
	return time.Time{}
}

func (s *RegistrationQuotaService) PruneNow() (int, error) {
	if s == nil {
		return 0, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := s.pruneStateLocked(s.now())
	if removed == 0 {
		return 0, nil
	}
	return removed, s.persistLocked()
}

func (s *RegistrationQuotaService) EventCountForTest() int {
	if s == nil {
		return 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.state.Events)
}
