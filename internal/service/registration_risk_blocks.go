package service

import "sort"

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
	s.clearRiskTriggerWindowLocked(removed, s.now())
	if err := s.persistLocked(); err != nil {
		s.state = previous
		return false, err
	}
	return true, nil
}
