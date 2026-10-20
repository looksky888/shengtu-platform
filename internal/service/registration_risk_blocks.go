package service

import (
	"sort"
	"time"

	"chatgpt2api/internal/util"
)

func (s *RegistrationQuotaService) ActiveBlocks() ([]RegistrationRiskBlock, error) {
	if s == nil {
		return []RegistrationRiskBlock{}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := cloneRegistrationQuotaState(s.state)
	if s.pruneRegistrationBlocksLocked(s.now()) > 0 {
		if err := s.persistLocked(); err != nil {
			s.state = previous
			return nil, err
		}
	}
	items := append([]RegistrationRiskBlock{}, s.state.Blocks...)
	sort.Slice(items, func(i, j int) bool { return items[i].ExpiresAt > items[j].ExpiresAt })
	return items, nil
}

// DeleteBlock removes one active block row (manual unblock in the admin UI).
//
// It intentionally deletes no ledger row: the Events/Attempts that triggered the block
// stay for audit, and a shared/NAT egress keeps its co-tenants' records and quota. The
// unblock only records when this kind+key was released, which moves that counter's
// window start so the key can register again immediately (see riskUnblockCutoffLocked).
func (s *RegistrationQuotaService) DeleteBlock(id string) (bool, error) {
	if s == nil || id == "" {
		return false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	next := make([]RegistrationRiskBlock, 0, len(s.state.Blocks))
	found := false
	var removed RegistrationRiskBlock
	for _, block := range s.state.Blocks {
		if block.ID == id {
			found = true
			removed = block
			continue
		}
		next = append(next, block)
	}
	if !found {
		return false, nil
	}
	previous := cloneRegistrationQuotaState(s.state)
	s.state.Blocks = next
	s.state.Unblocks = append(s.state.Unblocks, RegistrationRiskUnblock{
		ID:        "unblock_" + util.NewHex(10),
		Kind:      removed.Kind,
		Key:       removed.Key,
		Code:      removed.Code,
		CreatedAt: s.now().UTC().Format(time.RFC3339Nano),
	})
	if err := s.persistLocked(); err != nil {
		s.state = previous
		return false, err
	}
	return true, nil
}
