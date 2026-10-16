package service

import "time"

// clearRiskTriggerWindowLocked makes manual unblock effective immediately.
// Historical rows outside the active policy window remain for audit.
func (s *RegistrationQuotaService) clearRiskTriggerWindowLocked(block RegistrationRiskBlock, now time.Time) {
	switch block.Kind {
	case riskBlockDevice:
		cutoff := now.AddDate(0, 0, -s.policy.DeviceWindowDays)
		s.state.Events = filterRegistrationEvents(s.state.Events, func(event RegistrationQuotaEvent) bool {
			return quotaEventInWindow(event, cutoff) && event.DeviceID == block.Key
		})
	case riskBlockIP:
		cutoff := now.Add(-time.Duration(s.policy.IPWindowHours) * time.Hour)
		s.state.Events = filterRegistrationEvents(s.state.Events, func(event RegistrationQuotaEvent) bool {
			return quotaEventInWindow(event, cutoff) && NormalizeClientIP(event.ClientIP) == block.Key
		})
	case riskBlockPair:
		cutoff := now.Add(-time.Duration(s.policy.PairAttemptWindowMinutes) * time.Minute)
		next := make([]RegistrationAttempt, 0, len(s.state.Attempts))
		for _, attempt := range s.state.Attempts {
			created := parseRegistrationQuotaTime(attempt.CreatedAt)
			if created.After(cutoff) && riskPairKey(attempt.ClientIP, attempt.DeviceID) == block.Key {
				continue
			}
			next = append(next, attempt)
		}
		s.state.Attempts = next
	}
}

func filterRegistrationEvents(events []RegistrationQuotaEvent, remove func(RegistrationQuotaEvent) bool) []RegistrationQuotaEvent {
	next := make([]RegistrationQuotaEvent, 0, len(events))
	for _, event := range events {
		if !remove(event) {
			next = append(next, event)
		}
	}
	return next
}
