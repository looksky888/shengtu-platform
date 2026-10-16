package service

import (
	"errors"
	"strings"
	"testing"
)

type imageTaskStatsTestStore struct {
	failStatsLoad bool
	failStats     bool
	failTasks     bool
	statsSaves    int
	deletes       int
	lastStats     any
}

func (s *imageTaskStatsTestStore) LoadJSONDocument(string) (any, error) {
	if s.failStatsLoad {
		return nil, errors.New("stats read failed")
	}
	return nil, nil
}

func (s *imageTaskStatsTestStore) SaveJSONDocument(name string, value any) error {
	if name == imageTaskStatsLedgerDocName {
		s.statsSaves++
		if s.failStats {
			return errors.New("stats write failed")
		}
		s.lastStats = value
	}
	if s.failTasks && name != imageTaskStatsLedgerDocName {
		return errors.New("task write failed")
	}
	return nil
}

func TestImageTaskDetailWriteFailureSchedulesRetry(t *testing.T) {
	store := &imageTaskStatsTestStore{failTasks: true}
	key := taskKey("u1", "done")
	svc := &ImageTaskService{
		store: store, storeReady: true,
		tasks:     map[string]*ImageTask{key: {ID: "done", OwnerID: "u1", Status: TaskStatusSuccess}},
		dirtyKeys: map[string]struct{}{key: {}}, removedKeys: map[string]struct{}{}, dirty: true,
		statsLedger: emptyImageTaskStatsLedger(),
	}
	if err := svc.saveLocked(); err == nil {
		t.Fatal("task save succeeded while store was failing")
	}
	if !svc.dirty || svc.saveTimer == nil {
		t.Fatal("failed task save did not retain dirty state and retry timer")
	}
	if svc.persistenceError == "" {
		t.Fatal("failed task save did not expose persistence error")
	}
	store.failTasks = false
	if err := svc.flushSaveLocked(); err != nil {
		t.Fatalf("task retry flush: %v", err)
	}
	if svc.dirty || svc.saveTimer != nil {
		t.Fatalf("successful task retry state: dirty=%v timer=%v", svc.dirty, svc.saveTimer != nil)
	}
	if svc.persistenceError != "" {
		t.Fatalf("successful task retry left persistence error: %q", svc.persistenceError)
	}
}

func TestImageTaskQueueSnapshotExposesPersistenceFailure(t *testing.T) {
	svc := &ImageTaskService{
		tasks:            map[string]*ImageTask{},
		persistenceError: "task write failed",
	}
	if payload := svc.taskQueueSnapshotJSONLocked(); !strings.Contains(payload, `"persistence_error":"task write failed"`) {
		t.Fatalf("queue snapshot = %s", payload)
	}
}

func (s *imageTaskStatsTestStore) DeleteJSONDocument(string) error {
	s.deletes++
	return nil
}

func TestImageTaskStatsLoadFailureRefusesClear(t *testing.T) {
	store := &imageTaskStatsTestStore{failStatsLoad: true}
	key := taskKey("u1", "done")
	svc := &ImageTaskService{
		store:      store,
		storeReady: true,
		tasks: map[string]*ImageTask{
			key: {ID: "done", OwnerID: "u1", Status: TaskStatusSuccess},
		},
	}
	ledger, ready := svc.loadStatsLedgerLocked()
	if ready || ledger != nil {
		t.Fatalf("load result = (%#v, %v), want (nil, false)", ledger, ready)
	}
	svc.statsLedger = ledger
	svc.storeReady = ready
	if _, err := svc.AdminClearTasks("finished"); err == nil {
		t.Fatal("AdminClearTasks succeeded after stats load failure")
	}
	if svc.tasks[key] == nil || store.statsSaves != 0 || store.deletes != 0 {
		t.Fatalf("load failure mutated state: tasks=%#v saves=%d deletes=%d", svc.tasks, store.statsSaves, store.deletes)
	}
}

func TestImageTaskStatsWritesCoalesceAndRetry(t *testing.T) {
	store := &imageTaskStatsTestStore{failStats: true}
	svc := &ImageTaskService{
		store:       store,
		tasks:       map[string]*ImageTask{},
		statsLedger: emptyImageTaskStatsLedger(),
	}
	svc.recordTerminalStatsLocked(&ImageTask{
		ID: "one", OwnerID: "u1", Status: TaskStatusSuccess, Count: 1, FinishedAt: "2026-08-02 10:00:00",
	})
	svc.recordTerminalStatsLocked(&ImageTask{
		ID: "two", OwnerID: "u1", Status: TaskStatusError, Count: 1, FinishedAt: "2026-08-02 10:01:00",
	})
	if store.statsSaves != 0 || svc.statsLedgerSaveTimer == nil {
		t.Fatalf("terminal events were not coalesced: saves=%d timer=%v", store.statsSaves, svc.statsLedgerSaveTimer != nil)
	}
	if err := svc.flushStatsLedgerSaveLocked(); err == nil {
		t.Fatal("flush succeeded while store was failing")
	}
	if !svc.statsLedgerDirty || svc.statsLedgerSaveTimer == nil {
		t.Fatal("failed save did not retain dirty state and retry timer")
	}

	store.failStats = false
	if err := svc.flushStatsLedgerSaveLocked(); err != nil {
		t.Fatalf("retry flush: %v", err)
	}
	if svc.statsLedgerDirty || svc.statsLedgerSaveTimer != nil || store.lastStats == nil {
		t.Fatalf("successful retry state: dirty=%v timer=%v last=%#v", svc.statsLedgerDirty, svc.statsLedgerSaveTimer != nil, store.lastStats)
	}
}

func TestImageTaskStatsPrunesOnlyUnretainedTaskKeys(t *testing.T) {
	svc := &ImageTaskService{
		tasks: map[string]*ImageTask{"u1:kept": {ID: "kept", OwnerID: "u1"}},
		statsLedger: &imageTaskStatsLedger{
			Days:     map[string]*imageTaskStatsDayBucket{"2026-08-02": {Date: "2026-08-02", SuccessTasks: 2}},
			Recorded: map[string]bool{"u1:kept": true, "u1:removed": true},
		},
	}
	if removed := svc.pruneStatsLedgerRecordedLocked(); removed != 1 {
		t.Fatalf("pruned = %d, want 1", removed)
	}
	if !svc.statsLedger.Recorded["u1:kept"] || svc.statsLedger.Recorded["u1:removed"] {
		t.Fatalf("recorded keys = %#v", svc.statsLedger.Recorded)
	}
	if svc.statsLedger.Days["2026-08-02"].SuccessTasks != 2 {
		t.Fatal("pruning idempotency keys changed historical day totals")
	}
	if svc.statsLedgerSaveTimer != nil {
		svc.statsLedgerSaveTimer.Stop()
	}
}

func TestImageTaskRemovalWaitsForStatsPersistence(t *testing.T) {
	store := &imageTaskStatsTestStore{failStats: true}
	key := taskKey("u1", "done")
	svc := &ImageTaskService{
		store:            store,
		storeReady:       true,
		tasks:            map[string]*ImageTask{},
		removedKeys:      map[string]struct{}{key: {}},
		dirtyKeys:        map[string]struct{}{},
		indexDirty:       true,
		dirty:            true,
		statsLedgerDirty: true,
		statsLedger: &imageTaskStatsLedger{
			Days:     map[string]*imageTaskStatsDayBucket{"2026-08-02": {Date: "2026-08-02", SuccessTasks: 1}},
			Recorded: map[string]bool{key: true},
		},
	}
	if err := svc.saveLocked(); err == nil {
		t.Fatal("task deletion succeeded before stats persistence")
	}
	if store.deletes != 0 {
		t.Fatalf("task documents deleted before stats save: %d", store.deletes)
	}

	store.failStats = false
	if err := svc.saveLocked(); err != nil {
		t.Fatalf("task deletion retry: %v", err)
	}
	if store.deletes != 1 || svc.statsLedger.Recorded[key] {
		t.Fatalf("post-delete state: deletes=%d recorded=%#v", store.deletes, svc.statsLedger.Recorded)
	}
	if svc.statsLedgerSaveTimer != nil {
		svc.statsLedgerSaveTimer.Stop()
	}
}
