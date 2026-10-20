package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func resetRegisterClearanceStateForTest(t *testing.T) {
	t.Helper()
	registerClearanceMu.Lock()
	previousCache := registerClearanceCache
	previousFlight := registerClearanceFlight
	registerClearanceCache = map[string]*registerClearanceBundle{}
	registerClearanceFlight = map[string]*registerClearanceFlightState{}
	registerClearanceMu.Unlock()
	t.Cleanup(func() {
		registerClearanceMu.Lock()
		registerClearanceCache = previousCache
		registerClearanceFlight = previousFlight
		registerClearanceMu.Unlock()
	})
}

func newRegisterClearanceTestWorker(t *testing.T, flaresolverrURL string) *registerWorker {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New() error = %v", err)
	}
	return &registerWorker{
		service: &RegisterService{},
		client:  &http.Client{Jar: jar},
		config: map[string]any{"clearance": map[string]any{
			"enabled":                  true,
			"mode":                     "flaresolverr",
			"flaresolverr_url":         flaresolverrURL,
			"timeout_seconds":          5,
			"refresh_interval_seconds": 3600,
		}},
	}
}

func writeRegisterClearanceSolution(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok","solution":{"url":"https://auth.openai.com/","status":200,"userAgent":"clearance-agent","cookies":[{"name":"cf_clearance","value":"token","domain":".auth.openai.com","path":"/"}]}}`))
}

func waitForRegisterClearanceRequests(t *testing.T, requests *int32, want int32) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if atomic.LoadInt32(requests) >= want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("flaresolverr requests = %d, want at least %d", atomic.LoadInt32(requests), want)
}

// TestRegisterClearanceRefreshCoalescesConcurrentWorkers pins the audit
// finding: the refresh must register an in-flight entry under the mutex and run
// the FlareSolverr call outside it, so concurrent workers share one request
// instead of queueing on a process-wide lock.
func TestRegisterClearanceRefreshCoalescesConcurrentWorkers(t *testing.T) {
	resetRegisterClearanceStateForTest(t)
	release := make(chan struct{})
	var requests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requests, 1)
		select {
		case <-release:
		case <-r.Context().Done():
		}
		writeRegisterClearanceSolution(w)
	}))
	defer server.Close()

	ctx := context.Background()
	leader := newRegisterClearanceTestWorker(t, server.URL)
	leaderDone := make(chan error, 1)
	go func() { leaderDone <- leader.refreshCloudflareClearance(ctx, "https://auth.openai.com/") }()
	waitForRegisterClearanceRequests(t, &requests, 1)

	const followers = 4
	followerDone := make(chan error, followers)
	for i := 0; i < followers; i++ {
		worker := newRegisterClearanceTestWorker(t, server.URL)
		go func() { followerDone <- worker.refreshCloudflareClearance(ctx, "https://auth.openai.com/") }()
	}
	// Give every follower time to observe the in-flight entry before the leader
	// finishes; a follower that arrives later still reuses the cached bundle.
	time.Sleep(200 * time.Millisecond)
	close(release)

	if err := <-leaderDone; err != nil {
		t.Fatalf("leader refreshCloudflareClearance() error = %v", err)
	}
	for i := 0; i < followers; i++ {
		if err := <-followerDone; err != nil {
			t.Fatalf("follower refreshCloudflareClearance() error = %v", err)
		}
	}
	if got := atomic.LoadInt32(&requests); got != 1 {
		t.Fatalf("flaresolverr requests = %d, want 1 (concurrent refresh must be coalesced)", got)
	}
	if leader.clearanceUserAgent != "clearance-agent" {
		t.Fatalf("clearance user agent = %q, want clearance-agent", leader.clearanceUserAgent)
	}
}

// TestRegisterClearanceRefreshDoesNotSerializeDistinctKeys pins the "one stuck
// FlareSolverr blocks all 64 register threads" half of the finding.
func TestRegisterClearanceRefreshDoesNotSerializeDistinctKeys(t *testing.T) {
	resetRegisterClearanceStateForTest(t)
	release := make(chan struct{})
	var requests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&requests, 1) == 1 {
			select {
			case <-release:
			case <-r.Context().Done():
			}
		}
		writeRegisterClearanceSolution(w)
	}))
	defer server.Close()

	ctx := context.Background()
	stalled := newRegisterClearanceTestWorker(t, server.URL)
	stalledDone := make(chan error, 1)
	go func() { stalledDone <- stalled.refreshCloudflareClearance(ctx, "https://auth.openai.com/") }()
	waitForRegisterClearanceRequests(t, &requests, 1)

	other := newRegisterClearanceTestWorker(t, server.URL)
	otherDone := make(chan error, 1)
	go func() { otherDone <- other.refreshCloudflareClearance(ctx, "https://chatgpt.com/") }()
	select {
	case err := <-otherDone:
		if err != nil {
			t.Fatalf("second key refreshCloudflareClearance() error = %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a second (host, proxy) key blocked behind the stalled FlareSolverr request")
	}
	close(release)
	if err := <-stalledDone; err != nil {
		t.Fatalf("stalled refreshCloudflareClearance() error = %v", err)
	}
}

// TestRegisterClearanceRefreshWaiterHonorsContext pins the Stop() half of the
// finding: a worker waiting on an in-flight refresh must not be stuck on the
// mutex and must return as soon as its own context is cancelled.
func TestRegisterClearanceRefreshWaiterHonorsContext(t *testing.T) {
	resetRegisterClearanceStateForTest(t)
	release := make(chan struct{})
	var requests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requests, 1)
		select {
		case <-release:
		case <-r.Context().Done():
		}
		writeRegisterClearanceSolution(w)
	}))
	defer server.Close()

	leader := newRegisterClearanceTestWorker(t, server.URL)
	leaderDone := make(chan error, 1)
	go func() {
		leaderDone <- leader.refreshCloudflareClearance(context.Background(), "https://auth.openai.com/")
	}()
	waitForRegisterClearanceRequests(t, &requests, 1)

	waiter := newRegisterClearanceTestWorker(t, server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	waiterDone := make(chan error, 1)
	go func() { waiterDone <- waiter.refreshCloudflareClearance(ctx, "https://auth.openai.com/") }()
	time.Sleep(100 * time.Millisecond)
	cancel()
	select {
	case err := <-waiterDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("waiter error = %v, want context.Canceled", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("waiter ignored its context cancellation while a refresh was in flight")
	}
	close(release)
	if err := <-leaderDone; err != nil {
		t.Fatalf("leader refreshCloudflareClearance() error = %v", err)
	}
}

func TestRegisterClearanceRefreshReusesFreshBundle(t *testing.T) {
	resetRegisterClearanceStateForTest(t)
	var requests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requests, 1)
		writeRegisterClearanceSolution(w)
	}))
	defer server.Close()

	worker := newRegisterClearanceTestWorker(t, server.URL)
	for attempt := 0; attempt < 2; attempt++ {
		if err := worker.refreshCloudflareClearance(context.Background(), "https://auth.openai.com/"); err != nil {
			t.Fatalf("refreshCloudflareClearance() error = %v", err)
		}
	}
	if got := atomic.LoadInt32(&requests); got != 1 {
		t.Fatalf("flaresolverr requests = %d, want 1 (fresh bundle must be reused)", got)
	}
}
