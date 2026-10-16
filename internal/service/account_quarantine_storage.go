package service

import (
	"encoding/json"
	"os"
	"path/filepath"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func (s *AccountService) appendQuarantine(path string, entry quarantineEntry) error {
	s.quarantineMu.Lock()
	defer s.quarantineMu.Unlock()
	list, err := s.loadQuarantineLockedStrict(path)
	if err != nil {
		return err
	}
	// de-dupe by token
	next := make([]quarantineEntry, 0, len(list)+1)
	for _, item := range list {
		if util.Clean(item.AccessToken) == entry.AccessToken {
			continue
		}
		next = append(next, item)
	}
	next = append([]quarantineEntry{entry}, next...)
	next = pruneQuarantineEntries(next, s.quarantineMax())
	return s.saveQuarantineLocked(path, next)
}

// pruneQuarantineEntries keeps at most max rows (newest-first order preserved).
// When over cap, drop oldest temporary/unknown first so permanent recoverability lasts longer.
func pruneQuarantineEntries(list []quarantineEntry, max int) []quarantineEntry {
	if max <= 0 || len(list) <= max {
		return list
	}
	excess := len(list) - max
	drop := make([]bool, len(list))
	dropped := 0
	// Pass 1: oldest temporary / unknown (tail of newest-first list).
	for i := len(list) - 1; i >= 0 && dropped < excess; i-- {
		grade := list[i].Grade
		if grade == string(DisposalTemporary) || grade == string(DisposalUnknown) || grade == "" {
			drop[i] = true
			dropped++
		}
	}
	// Pass 2: any remaining oldest.
	for i := len(list) - 1; i >= 0 && dropped < excess; i-- {
		if !drop[i] {
			drop[i] = true
			dropped++
		}
	}
	out := make([]quarantineEntry, 0, max)
	for i, entry := range list {
		if !drop[i] {
			out = append(out, entry)
		}
	}
	return out
}

func (s *AccountService) loadQuarantineLocked(path string) []quarantineEntry {
	list, _ := s.loadQuarantineLockedStrict(path)
	return list
}

func (s *AccountService) loadQuarantineLockedStrict(path string) ([]quarantineEntry, error) {
	if s.quarantineCacheOK {
		return append([]quarantineEntry(nil), s.quarantineCache...), nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			s.quarantineCache = nil
			s.quarantineCacheOK = true
			return []quarantineEntry{}, nil
		}
		return nil, err
	}
	var list []quarantineEntry
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	s.quarantineCache = list
	s.quarantineCacheOK = true
	return append([]quarantineEntry(nil), list...), nil
}

func (s *AccountService) saveQuarantineLocked(path string, list []quarantineEntry) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if list == nil {
		list = []quarantineEntry{}
	}
	// Compact JSON: smaller on disk and faster than MarshalIndent at multi-k entries.
	data, err := json.Marshal(list)
	if err != nil {
		return err
	}
	if err := storage.AtomicWriteFile(path, append(data, '\n'), 0o600); err != nil {
		s.quarantineCacheOK = false
		return err
	}
	s.quarantineCache = append([]quarantineEntry(nil), list...)
	s.quarantineCacheOK = true
	return nil
}
