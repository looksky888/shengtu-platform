package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func withMockAppleAccountBaseURL(t *testing.T, url string) {
	t.Helper()
	prev := appleAccountManageBaseURL
	appleAccountManageBaseURL = url
	t.Cleanup(func() {
		appleAccountManageBaseURL = prev
	})
}

func TestKeepAlivePreservesScntWhenWithoutScntFallbackHasNoHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/account/manage/gs/ws/token":
			w.Header().Set("Content-Type", "application/json")
			if r.Header.Get("scnt") != "" {
				// First call returns TimeOutInterval=0 so keepalive triggers portal warmup + withoutScnt
				_ = json.NewEncoder(w).Encode(map[string]any{"timeOutInterval": 0})
				return
			}
			// Fallback withoutScnt succeeds via Cookies without emitting a new scnt response header!
			_ = json.NewEncoder(w).Encode(map[string]any{"timeOutInterval": 15})
		case "/account/manage/section/privacy":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/bootstrap/portal":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"timeOutInterval": 15})
		case "/account/manage":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"apiKey": "key-live-1"})
		case "/account/manage/forwardemail":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"emails": []any{}})
		case "/v2/jslogs":
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	withMockAppleAccountBaseURL(t, server.URL)

	client := &ICloudClient{client: server.Client()}
	initial := LoginState{
		Kind:      LoginStateAppleAccount,
		Scnt:      "scnt-original-valid",
		SessionID: "sess-1",
		APIKey:    "key-live-1",
		Cookies:   []SessionCookie{{Name: "myacinfo", Value: "cookie-val", Domain: "127.0.0.1", Path: "/"}},
	}

	next, err := client.KeepAliveAppleAccountManageState(context.Background(), initial)
	if err != nil {
		t.Fatalf("KeepAliveAppleAccountManageState error = %v", err)
	}
	if next.Scnt != "scnt-original-valid" {
		t.Fatalf("Scnt was wiped or mutated: got %q, want %q", next.Scnt, "scnt-original-valid")
	}
	if !next.LastCheckOK {
		t.Fatalf("expected LastCheckOK = true, got false (%s)", next.LastStatusMessage)
	}

	sess := withAppleAccountLoginState(ICloudSession{AccountID: "acc_005175", AppleID: "3579524213@qq.com"}, next)
	pub := publicSession(&sess)
	if !pub.AppleAccountLoginSaved || pub.AppleAccountLoginState != loginChannelOK {
		t.Fatalf("unexpected public session state: saved=%v state=%q status=%q", pub.AppleAccountLoginSaved, pub.AppleAccountLoginState, pub.AppleAccountLoginStatus)
	}
}

func TestKeepAliveRecoversFromStaleScnt401OrWipedScntViaPortalCookies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/account/manage/gs/ws/token":
			if r.Header.Get("scnt") == "scnt-stale-8h" {
				// Empty-body 401 on stale scnt
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("scnt", "scnt-fresh-from-portal")
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"timeOutInterval": 15})
		case "/account/manage/section/privacy":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>privacy</html>"))
		case "/bootstrap/portal":
			w.Header().Set("scnt", "scnt-fresh-from-portal")
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"timeOutInterval": 15})
		case "/account/manage":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"apiKey": "key-recovered"})
		case "/account/manage/forwardemail":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"emails": []any{}})
		case "/v2/jslogs":
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	withMockAppleAccountBaseURL(t, server.URL)

	client := &ICloudClient{client: server.Client()}

	// Case A: Stale scnt returning empty-body 401 recovers via portal cookies
	recoveredFrom401, err := client.KeepAliveAppleAccountManageState(context.Background(), LoginState{
		Kind:      LoginStateAppleAccount,
		Scnt:      "scnt-stale-8h",
		SessionID: "sess-1",
		APIKey:    "key-old",
		Cookies:   []SessionCookie{{Name: "myacinfo", Value: "cookie-ok", Domain: "127.0.0.1", Path: "/"}},
	})
	if err != nil {
		t.Fatalf("expected recovery from stale scnt 401, got err = %v", err)
	}
	if recoveredFrom401.Scnt != "scnt-fresh-from-portal" || recoveredFrom401.APIKey != "key-recovered" {
		t.Fatalf("unexpected recovered state: %+v", recoveredFrom401)
	}

	// Case B: Session in state.db whose Scnt was previously wiped to "" still counts as saved and self-heals
	wipedSession := ICloudSession{
		AccountID: "acc_001461",
		AppleID:   "1055096752@qq.com",
		LoginStates: []LoginState{{
			Kind:        LoginStateAppleAccount,
			Scnt:        "",
			APIKey:      "key-existing",
			Cookies:     []SessionCookie{{Name: "myacinfo", Value: "cookie-ok", Domain: "127.0.0.1", Path: "/"}},
			LastCheckOK: true,
		}},
	}
	if !appleAccountLoginSaved(wipedSession) {
		t.Fatal("session with wiped Scnt but valid Cookies/APIKey should still be recognized as saved")
	}
	wipedState, _ := appleAccountLoginState(wipedSession)
	healed, err := client.KeepAliveAppleAccountManageState(context.Background(), wipedState)
	if err != nil {
		t.Fatalf("expected self-heal for wiped Scnt session, got err = %v", err)
	}
	if healed.Scnt != "scnt-fresh-from-portal" {
		t.Fatalf("expected healed Scnt = scnt-fresh-from-portal, got %q", healed.Scnt)
	}
}

func TestKeepAliveEmptyBody401MarksSessionExpiredAndStops30sSpam(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		// Empty-body 401 on every endpoint (both token and portal cookies truly expired)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()
	withMockAppleAccountBaseURL(t, server.URL)

	store, err := NewFileStore(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("NewFileStore error = %v", err)
	}
	defer store.Close()

	now := time.Now().Add(-10 * time.Minute)
	if err := store.SaveICloudSessionForOwner("", ICloudSession{
		AccountID: "acc_005175",
		AppleID:   "3579524213@qq.com",
		SavedAt:   now,
		LoginStates: []LoginState{{
			Kind:          LoginStateAppleAccount,
			Scnt:          "scnt-dead",
			APIKey:        "key-dead",
			Cookies:       []SessionCookie{{Name: "myacinfo", Value: "dead", Domain: "127.0.0.1", Path: "/"}},
			LastCheckedAt: now,
			LastCheckOK:   true,
		}},
	}); err != nil {
		t.Fatalf("SaveICloudSessionForOwner error = %v", err)
	}

	client := &ICloudClient{client: server.Client()}
	srv := &Server{
		store:                         store,
		appleAccountKeepAliveInterval: 5 * time.Minute,
		keepAliveAppleAccountState: func(ctx context.Context, state LoginState) (LoginState, error) {
			return client.keepAliveAppleAccountManageStateUnlocked(ctx, state)
		},
	}

	// First round hits token (401) -> portal warmup (401) -> marks session expired
	srv.keepAliveAppleAccountRound(context.Background())
	afterFirstRoundHits := hits.Load()
	if afterFirstRoundHits == 0 {
		t.Fatal("expected keepalive round to contact upstream at least once")
	}

	sessions := store.ICloudSessionsForOwner("")
	if len(sessions) != 1 {
		t.Fatalf("sessions len = %d, want 1", len(sessions))
	}
	pub := publicSession(&sessions[0])
	if !pub.AppleAccountLoginSaved {
		t.Fatal("expired session must remain saved (not misreported as 未登录)")
	}
	if pub.AppleAccountLoginState != loginChannelExpired {
		t.Fatalf("expected AppleAccountLoginState = %q, got %q (status=%q)", loginChannelExpired, pub.AppleAccountLoginState, pub.AppleAccountLoginStatus)
	}

	// Second round 30s later MUST NOT spam upstream again because LastCheckOK is now false!
	srv.keepAliveAppleAccountRound(context.Background())
	if got := hits.Load(); got != afterFirstRoundHits {
		t.Fatalf("keepalive kept spamming upstream after auth failure: hits went from %d to %d", afterFirstRoundHits, got)
	}
}
