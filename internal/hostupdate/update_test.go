package hostupdate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const testControlToken = "0123456789abcdef0123456789abcdef"

type updateRunner struct {
	mu       sync.Mutex
	commands []string
	onUp     func(int)
	upCount  int
}

func (r *updateRunner) Run(_ context.Context, name string, args ...string) error {
	command := name + " " + strings.Join(args, " ")
	r.mu.Lock()
	r.commands = append(r.commands, command)
	if strings.Contains(command, " up -d --no-deps app") {
		r.upCount++
		count, callback := r.upCount, r.onUp
		r.mu.Unlock()
		if callback != nil {
			callback(count)
		}
		return nil
	}
	r.mu.Unlock()
	return nil
}

func (r *updateRunner) joined() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return strings.Join(r.commands, "\n")
}

type backupStub struct {
	artifact BackupArtifact
	created  atomic.Int32
	restored atomic.Int32
}

func (b *backupStub) Create(context.Context, string) (BackupArtifact, error) {
	b.created.Add(1)
	return b.artifact, nil
}

func (b *backupStub) Restore(context.Context, BackupArtifact) error {
	b.restored.Add(1)
	return nil
}

func TestUpdateTransactionSucceedsWithExactImageAndStableReadiness(t *testing.T) {
	identity := atomic.Value{}
	identity.Store(ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1})
	manager, runner, backup, cleanup := newUpdateFixture(t, &identity)
	defer cleanup()
	runner.onUp = func(int) { identity.Store(ApplicationIdentity{Version: testReleaseVersion, SchemaVersion: 1}) }

	result, err := manager.StartUpdate(UpdateRequest{TaskID: manager.State().TaskID})
	if err != nil || !result.Started {
		t.Fatalf("StartUpdate() = %#v, %v", result, err)
	}
	duplicate, err := manager.StartUpdate(UpdateRequest{TaskID: result.State.TaskID})
	if err != nil || duplicate.Started {
		t.Fatalf("duplicate StartUpdate() = %#v, %v", duplicate, err)
	}
	state := waitForUpdateTerminal(t, manager)
	if state.Status != StatusSucceeded || state.Transaction == nil || !state.Transaction.OverrideSwitched {
		t.Fatalf("state = %#v", state)
	}
	if backup.created.Load() != 1 || backup.restored.Load() != 0 {
		t.Fatalf("backup create=%d restore=%d", backup.created.Load(), backup.restored.Load())
	}
	commands := runner.joined()
	wantImage := "ghcr.io/looksky888/shengtu-platform@" + testReleaseDigest
	if !strings.Contains(commands, "docker pull "+wantImage) || !strings.Contains(commands, " stop app") || !strings.Contains(commands, " up -d --no-deps app") {
		t.Fatalf("commands:\n%s", commands)
	}
	override, err := os.ReadFile(manager.opts.ManagedOverride)
	if err != nil || !strings.Contains(string(override), wantImage) {
		t.Fatalf("managed override = %q, %v", override, err)
	}
}

func TestUpdateFailureRestoresBackupOverrideAndSourceVersion(t *testing.T) {
	identity := atomic.Value{}
	identity.Store(ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1})
	manager, runner, backup, cleanup := newUpdateFixture(t, &identity)
	defer cleanup()
	oldOverride := "services:\n  app:\n    image: old@example\n"
	writeTestFile(t, manager.opts.ManagedOverride, oldOverride)
	runner.onUp = func(count int) {
		if count == 1 {
			identity.Store(ApplicationIdentity{Version: "wrong-version", SchemaVersion: 1})
			return
		}
		identity.Store(ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1})
	}

	if _, err := manager.StartUpdate(UpdateRequest{TaskID: manager.State().TaskID}); err != nil {
		t.Fatal(err)
	}
	state := waitForUpdateTerminal(t, manager)
	if state.Status != StatusRolledBack || !strings.Contains(state.Error, "已自动回滚") {
		t.Fatalf("state = %#v", state)
	}
	if backup.created.Load() != 1 || backup.restored.Load() != 1 {
		t.Fatalf("backup create=%d restore=%d", backup.created.Load(), backup.restored.Load())
	}
	assertTestFile(t, manager.opts.ManagedOverride, oldOverride)
	if count := strings.Count(runner.joined(), " up -d --no-deps app"); count != 2 {
		t.Fatalf("up count = %d, commands:\n%s", count, runner.joined())
	}
}

func TestStartUpdateRejectsStaleTaskID(t *testing.T) {
	identity := atomic.Value{}
	identity.Store(ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1})
	manager, _, _, cleanup := newUpdateFixture(t, &identity)
	defer cleanup()
	if _, err := manager.StartUpdate(UpdateRequest{TaskID: "stale"}); err == nil || !strings.Contains(err.Error(), "ID 已失效") {
		t.Fatalf("StartUpdate() error = %v", err)
	}
}

func TestRecoverInterruptedStopIntentRestartsSourceVersion(t *testing.T) {
	identity := atomic.Value{}
	identity.Store(ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1})
	manager, runner, _, cleanup := newUpdateFixture(t, &identity)
	defer cleanup()
	runner.onUp = func(int) { identity.Store(ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1}) }
	previousPath := filepath.Join(manager.opts.StateDir, "previous-interrupted.override.yml")
	oldOverride := "services:\n  app:\n    image: old@example\n"
	writeTestFile(t, previousPath, oldOverride)
	writeTestFile(t, manager.opts.ManagedOverride, "services:\n  app:\n    image: new@example\n")
	manager.state.Status = StatusUpdating
	manager.state.Transaction = &UpdateTransaction{
		PreviousOverridePath: previousPath, PreviousOverrideExisted: true,
		OverridePrepared: true, StopInitiated: true,
	}
	if err := manager.saveLocked(); err != nil {
		t.Fatal(err)
	}
	manager.RecoverInterrupted()
	state := waitForUpdateTerminal(t, manager)
	if state.Status != StatusRolledBack || !strings.Contains(state.Error, "更新器重启中断") {
		t.Fatalf("state = %#v", state)
	}
	if !strings.Contains(runner.joined(), " up -d --no-deps app") {
		t.Fatalf("commands:\n%s", runner.joined())
	}
	assertTestFile(t, manager.opts.ManagedOverride, oldOverride)
}

func TestFailedPreparationReportsResumeFailure(t *testing.T) {
	identity := atomic.Value{}
	identity.Store(ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1})
	manager, _, _, cleanup := newUpdateFixture(t, &identity)
	defer cleanup()
	failingControl := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == appResumePath {
			http.Error(w, "resume unavailable", http.StatusServiceUnavailable)
			return
		}
		_ = json.NewEncoder(w).Encode(AppDrainState{Drained: true})
	}))
	defer failingControl.Close()
	client, err := newAppControlClient(failingControl.URL, testControlToken, failingControl.Client())
	if err != nil {
		t.Fatal(err)
	}
	manager.app = client

	manager.failAndResume(manager.State().TaskID, errors.New("prepare failed"))
	state := manager.State()
	if state.Status != StatusFailed || !strings.Contains(state.Error, "prepare failed") || !strings.Contains(state.Error, "resume unavailable") {
		t.Fatalf("state = %#v", state)
	}
}

func newUpdateFixture(t *testing.T, identity *atomic.Value) (*Manager, *updateRunner, *backupStub, func()) {
	t.Helper()
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "docker-compose.yml"), "services: {}\n")
	if err := os.MkdirAll(filepath.Join(root, "data"), 0o700); err != nil {
		t.Fatal(err)
	}
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+testControlToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if r.URL.Path != appDrainPath && r.URL.Path != appStatusPath && r.URL.Path != appResumePath {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(AppDrainState{Drained: true})
	}))
	readiness := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		current := identity.Load().(ApplicationIdentity)
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "ready", "version": current.Version, "schema_version": current.SchemaVersion})
	}))
	opts := Options{
		StateDir: filepath.Join(root, "state"), InstallDir: root, DataDir: filepath.Join(root, "data"),
		ComposeFiles: []string{"docker-compose.yml"}, BackupDir: filepath.Join(root, "backups"),
		ManagedOverride: filepath.Join(root, "state", "image.override.yml"), ComposeProject: "shengtu", AppService: "app",
		ReadinessURL: readiness.URL, AppControlURL: control.URL, AppControlToken: testControlToken,
		CommandTimeout: time.Second, DrainTimeout: time.Second, UpdateTimeout: 120 * time.Millisecond,
		ReadinessInterval: 5 * time.Millisecond, ReadinessStableCount: 2,
	}
	manager, err := NewManager(opts)
	if err != nil {
		t.Fatal(err)
	}
	runner := &updateRunner{}
	backup := &backupStub{artifact: BackupArtifact{Path: filepath.Join(root, "backup.zip"), SHA256: strings.Repeat("a", 64), Size: 1}}
	manager.runner, manager.backup = runner, backup
	manager.state = State{
		TaskID: "0123456789abcdef", Status: StatusReady, Phase: "completed", Checks: []Check{}, UpdatedAt: nowISO(),
		Source: &ApplicationIdentity{Version: "4.5-old", SchemaVersion: 1},
		Target: &ReleaseTarget{Version: testReleaseVersion, Image: "ghcr.io/looksky888/shengtu-platform", Digest: testReleaseDigest, StorageSchemaVersion: 1},
	}
	if err := manager.saveLocked(); err != nil {
		t.Fatal(err)
	}
	return manager, runner, backup, func() { control.Close(); readiness.Close() }
}

func waitForUpdateTerminal(t *testing.T, manager *Manager) State {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		state := manager.State()
		if state.Status == StatusSucceeded || state.Status == StatusRolledBack || state.Status == StatusFailed {
			return state
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("update did not finish")
	return State{}
}
