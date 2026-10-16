package service

import (
	"fmt"
	"log"
	"time"
)

const imageTaskSaveRetryDelay = 5 * time.Second

// saveLocked persists dirty task rows (sharded) or the monolithic document (file-only mode).
func (s *ImageTaskService) saveLocked() error {
	if !s.storeReady {
		err := fmt.Errorf("创作任务数据未成功加载，已拒绝写入以防清空存储")
		s.persistenceError = err.Error()
		return err
	}
	hadRemovals := len(s.removedKeys) > 0
	if hadRemovals {
		// Persist terminal counts before deleting their source task rows.
		if err := s.flushStatsLedgerSaveLocked(); err != nil {
			s.dirty = true
			s.scheduleTaskSaveRetryLocked()
			wrapped := fmt.Errorf("保存创作统计后再删除任务: %w", err)
			s.persistenceError = wrapped.Error()
			return wrapped
		}
	}
	var err error
	if s.store != nil {
		err = s.saveShardedLocked()
	} else {
		err = s.saveMonolithicLocked()
	}
	if err != nil {
		s.dirty = true
		log.Printf("image task save failed: %v", err)
		s.persistenceError = err.Error()
		s.scheduleTaskSaveRetryLocked()
		return err
	}
	if s.saveTimer != nil {
		s.saveTimer.Stop()
		s.saveTimer = nil
	}
	s.dirty = false
	s.dirtyKeys = map[string]struct{}{}
	s.removedKeys = map[string]struct{}{}
	s.indexDirty = false
	s.lastSaveAt = time.Now()
	if hadRemovals && s.pruneStatsLedgerRecordedLocked() > 0 {
		if err := s.flushStatsLedgerSaveLocked(); err != nil {
			s.persistenceError = fmt.Sprintf("保存创作统计账本失败: %v", err)
			return err
		}
	}
	if !s.statsLedgerDirty {
		s.persistenceError = ""
	}
	return nil
}

// scheduleTaskSaveRetryLocked keeps failed terminal/detail writes durable without
// requiring another progress event. Caller holds s.mu.
func (s *ImageTaskService) scheduleTaskSaveRetryLocked() {
	if s.closing || !s.dirty || s.saveTimer != nil {
		return
	}
	s.saveTimer = time.AfterFunc(imageTaskSaveRetryDelay, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.saveTimer = nil
		if !s.closing && s.dirty {
			hadPersistenceError := s.persistenceError != ""
			if err := s.saveLocked(); err != nil {
				log.Printf("image task scheduled retry failed: %v", err)
			} else if hadPersistenceError {
				s.notifySubscribersLocked()
			}
		}
	})
}
