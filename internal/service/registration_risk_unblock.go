package service

import "time"

// riskUnblockCutoffLocked returns the effective window start for one block key after
// applying manual unblocks.
//
// Manual unblocking must not delete historical Events/Attempts: a NAT / shared egress
// would lose every co-tenant's registration history (audit ledger) and silently reset
// their subnet quota. Instead an unblock records the unblock time for that single
// kind+key, so only rows created afterwards count against that same key.
func (s *RegistrationQuotaService) riskUnblockCutoffLocked(kind, key string, cutoff time.Time) time.Time {
	if key == "" {
		return cutoff
	}
	for index := len(s.state.Unblocks) - 1; index >= 0; index-- {
		unblock := s.state.Unblocks[index]
		if unblock.Kind != kind || unblock.Key != key {
			continue
		}
		if at := parseRegistrationQuotaTime(unblock.CreatedAt); at.After(cutoff) {
			return at
		}
		return cutoff
	}
	return cutoff
}
