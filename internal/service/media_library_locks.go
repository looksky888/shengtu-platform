package service

import "sync"

type mediaAssetLock struct {
	mu   sync.Mutex
	refs int
}

type mediaAssetLockSet struct {
	mu    sync.Mutex
	items map[string]*mediaAssetLock
}

func (m *MediaLibrary) lockMediaAsset(id string) func() {
	m.assetLocks.mu.Lock()
	if m.assetLocks.items == nil {
		m.assetLocks.items = map[string]*mediaAssetLock{}
	}
	lock := m.assetLocks.items[id]
	if lock == nil {
		lock = &mediaAssetLock{}
		m.assetLocks.items[id] = lock
	}
	lock.refs++
	m.assetLocks.mu.Unlock()

	lock.mu.Lock()
	return func() {
		lock.mu.Unlock()
		m.assetLocks.mu.Lock()
		lock.refs--
		if lock.refs == 0 {
			delete(m.assetLocks.items, id)
		}
		m.assetLocks.mu.Unlock()
	}
}
