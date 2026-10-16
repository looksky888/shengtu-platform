package service

import "chatgpt2api/internal/util"

// RollbackSuccess removes a just-bound registration event during HTTP-level
// transaction compensation. It never removes older events for another user.
func (s *RegistrationQuotaService) RollbackSuccess(userID string) error {
	if s == nil || util.Clean(userID) == "" {
		return nil
	}
	userID = util.Clean(userID)
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := cloneRegistrationQuotaState(s.state)
	for index := len(s.state.Events) - 1; index >= 0; index-- {
		if util.Clean(s.state.Events[index].UserID) != userID {
			continue
		}
		s.state.Events = append(s.state.Events[:index], s.state.Events[index+1:]...)
		if err := s.saveLocked(); err != nil {
			s.state = previous
			return err
		}
		return nil
	}
	return nil
}
