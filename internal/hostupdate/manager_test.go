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
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	}))
	defer readiness.Close()
	manager, err := NewManager(Options{
		StateDir: filepath.Join(root, "state"), InstallDir: root,
		ComposeFiles: []string{"docker-compose.yml"}, BackupDir: filepath.Join(root, "backups"),
		ReadinessURL: readiness.URL, MinimumFree: 1, CommandTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	runner := &blockingRunner{entered: make(chan struct{}), release: make(chan struct{})}
	manager.runner = runner
	result, err := manager.StartPreflight(PreflightRequest{TargetVersion: "4.5-test"})
	if err != nil || !result.Started {
		t.Fatalf("StartPreflight() = %#v, %v", result, err)
	}
	<-runner.entered
	duplicate, err := manager.StartPreflight(PreflightRequest{TargetVersion: "4.5-test"})
	if err != nil || duplicate.Started || duplicate.State.TaskID != result.State.TaskID {
		t.Fatalf("duplicate StartPreflight() = %#v, %v", duplicate, err)
	}
	close(runner.release)
	state := waitForTerminal(t, manager)
	if state.Status != StatusReady || len(state.Checks) != 8 {
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
	manager, err := NewManager(Options{
		StateDir: filepath.Join(root, "state"), InstallDir: root,
		ComposeFiles: []string{"missing.yml"}, BackupDir: filepath.Join(root, "backups"),
		ReadinessURL: "http://127.0.0.1:1/ready", MinimumFree: 1, CommandTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	manager.runner = runnerStub{}
	if _, err := manager.StartPreflight(PreflightRequest{}); err != nil {
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
		_, _ = w.Write([]byte(`{"status":"not_ready"}`))
	}))
	defer readiness.Close()
	manager, err := NewManager(Options{
		StateDir: filepath.Join(root, "state"), InstallDir: root,
		ComposeFiles: []string{"docker-compose.yml"}, BackupDir: filepath.Join(root, "backups"),
		ReadinessURL: readiness.URL, MinimumFree: 1, CommandTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	manager.runner = runnerStub{}
	if _, err := manager.StartPreflight(PreflightRequest{}); err != nil {
		t.Fatal(err)
	}
	state := waitForTerminal(t, manager)
	if state.Status != StatusFailed || len(state.Checks) != 7 || !strings.Contains(state.Error, "HTTP 503") {
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
