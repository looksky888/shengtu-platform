package hostupdate

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type runnerStub struct{ err error }

func (r runnerStub) Run(context.Context, string, ...string) error { return r.err }

type blockingRunner struct {
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func (r *blockingRunner) Run(ctx context.Context, _ string, _ ...string) error {
	r.once.Do(func() { close(r.entered) })
	select {
	case <-r.release:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestPreflightPersistsSuccessfulState(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "docker-compose.yml"), []byte("services: {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	readiness := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"ready","schema_version":1}`))
	}))
	defer readiness.Close()
	release := newReleaseFixture(t, testReleaseManifest(testReleaseVersion, 1, 1, testReleaseDigest), false, nil)
	manager, err := NewManager(testManagerOptions(root, readiness.URL, release.URL))
	if err != nil {
		t.Fatal(err)
	}
	runner := &blockingRunner{entered: make(chan struct{}), release: make(chan struct{})}
	manager.runner = runner
	result, err := manager.StartPreflight(PreflightRequest{TargetVersion: testReleaseVersion})
	if err != nil || !result.Started {
		t.Fatalf("StartPreflight() = %#v, %v", result, err)
	}
	<-runner.entered
	duplicate, err := manager.StartPreflight(PreflightRequest{TargetVersion: testReleaseVersion})
	if err != nil || duplicate.Started || duplicate.State.TaskID != result.State.TaskID {
		t.Fatalf("duplicate StartPreflight() = %#v, %v", duplicate, err)
	}
	close(runner.release)
	state := waitForTerminal(t, manager)
	if state.Status != StatusReady || len(state.Checks) != 8 || state.Target == nil || state.Target.Digest != testReleaseDigest {
		t.Fatalf("state = %#v", state)
	}
	reloaded, err := NewManager(manager.opts)
	if err != nil {
		t.Fatal(err)
	}
	if got := reloaded.State(); got.Status != StatusReady || got.TaskID != state.TaskID {
		t.Fatalf("reloaded state = %#v", got)
	}
}

func TestPreflightStopsAtFirstFailure(t *testing.T) {
	root := t.TempDir()
	opts := testManagerOptions(root, "http://127.0.0.1:1/ready", "http://127.0.0.1:1")
	opts.ComposeFiles = []string{"missing.yml"}
	manager, err := NewManager(opts)
	if err != nil {
		t.Fatal(err)
	}
	manager.runner = runnerStub{}
	if _, err := manager.StartPreflight(PreflightRequest{TargetVersion: testReleaseVersion}); err != nil {
		t.Fatal(err)
	}
	state := waitForTerminal(t, manager)
	if state.Status != StatusFailed || len(state.Checks) != 2 || !strings.Contains(state.Error, "missing.yml") {
		t.Fatalf("state = %#v", state)
	}
}

func TestPreflightRejectsApplicationThatIsNotReady(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "docker-compose.yml"), []byte("services: {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	readiness := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"status":"not_ready","schema_version":1}`))
	}))
	defer readiness.Close()
	release := newReleaseFixture(t, testReleaseManifest(testReleaseVersion, 1, 1, testReleaseDigest), false, nil)
	manager, err := NewManager(testManagerOptions(root, readiness.URL, release.URL))
	if err != nil {
		t.Fatal(err)
	}
	manager.runner = runnerStub{}
	if _, err := manager.StartPreflight(PreflightRequest{TargetVersion: testReleaseVersion}); err != nil {
		t.Fatal(err)
	}
	state := waitForTerminal(t, manager)
	if state.Status != StatusFailed || len(state.Checks) != 8 || !strings.Contains(state.Error, "HTTP 503") {
		t.Fatalf("state = %#v", state)
	}
}

func TestPreflightRejectsIncompatibleStorageSchema(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "docker-compose.yml"), []byte("services: {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	readiness := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"ready","schema_version":1}`))
	}))
	defer readiness.Close()
	release := newReleaseFixture(t, testReleaseManifest(testReleaseVersion, 2, 2, testReleaseDigest), false, nil)
	manager, err := NewManager(testManagerOptions(root, readiness.URL, release.URL))
	if err != nil {
		t.Fatal(err)
	}
	manager.runner = runnerStub{}
	if _, err := manager.StartPreflight(PreflightRequest{TargetVersion: testReleaseVersion}); err != nil {
		t.Fatal(err)
	}
	state := waitForTerminal(t, manager)
	if state.Status != StatusFailed || state.Target != nil || !strings.Contains(state.Error, "最低来源版本") {
		t.Fatalf("state = %#v", state)
	}
}

func TestManagerInvalidatesLegacyReadyStateWithoutVerifiedTarget(t *testing.T) {
	root := t.TempDir()
	stateDir := filepath.Join(root, "state")
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, stateFileName), []byte(`{"status":"ready","updated_at":"2026-10-16T00:00:00Z","checks":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	manager, err := NewManager(Options{StateDir: stateDir})
	if err != nil {
		t.Fatal(err)
	}
	state := manager.State()
	if state.Status != StatusFailed || state.Phase != "stale" || !strings.Contains(state.Error, "重新执行预检") {
		t.Fatalf("state = %#v", state)
	}
}

func TestStartPreflightRejectsInvalidTargetVersion(t *testing.T) {
	manager, err := NewManager(Options{StateDir: filepath.Join(t.TempDir(), "state")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.StartPreflight(PreflightRequest{TargetVersion: "../release"}); err == nil || !strings.Contains(err.Error(), "格式无效") {
		t.Fatalf("StartPreflight() error = %v", err)
	}
	if state := manager.State(); state.Status != StatusIdle {
		t.Fatalf("state = %#v", state)
	}
}

func waitForTerminal(t *testing.T, manager *Manager) State {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		state := manager.State()
		if state.Status != StatusPreflight {
			return state
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("preflight did not finish")
	return State{}
}
