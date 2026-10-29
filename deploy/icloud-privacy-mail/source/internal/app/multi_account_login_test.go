package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestGlobalModeMultiAccountSessionsAndSQLiteDedupeMigration(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "state.db")
	seed, err := NewFileStore(dbPath)
	if err != nil {
		t.Fatalf("NewFileStore(seed) error = %v", err)
	}
	now := time.Now()
	seed.mu.Lock()
	seed.state = State{
		NextID: 6000,
		Accounts: []Account{
			{ID: "acc_000001", AppleID: "1055096752@qq.com", Label: "1055096752@qq.com", Status: StatusActive, ICloudStatus: ICloudStatusActive},
			{ID: "acc_000002", AppleID: "1055096752@qq.com", Label: "1055096752@qq.com", Status: StatusActive, ICloudStatus: ICloudStatusActive},
			{ID: "acc_001398", AppleID: "1055096752@qq.com", Label: "1055096752@qq.com", Status: StatusActive, ICloudStatus: ICloudStatusNeedLogin},
			{ID: "acc_001460", AppleID: "1055096752@qq.com", Label: "1055096752@qq.com", Status: StatusActive, ICloudStatus: ICloudStatusNeedLogin},
			{ID: "acc_001461", AppleID: "1055096752@qq.com", Label: "1055096752@qq.com", Status: StatusActive, ICloudStatus: ICloudStatusActive},
			{ID: "acc_005174", AppleID: "3579524213@qq.com", Label: "3579524213@qq.com", Status: StatusActive, ICloudStatus: ICloudStatusNeedLogin},
			{ID: "acc_005175", AppleID: "3579524213@qq.com", Label: "3579524213@qq.com", Status: StatusActive, ICloudStatus: ICloudStatusNeedLogin},
		},
		Mailboxes: []Mailbox{
			{ID: "mbx_1", AccountID: "acc_001398", Email: "one_hme@icloud.com", APIToken: "tok-1", APIActive: true, ICloudActive: true, Status: StatusAvailable, CreatedAt: now, UpdatedAt: now},
			{ID: "mbx_2", AccountID: "acc_001461", Email: "two_hme@icloud.com", APIToken: "tok-2", APIActive: true, ICloudActive: true, Status: StatusAvailable, CreatedAt: now, UpdatedAt: now},
			{ID: "mbx_3", AccountID: "acc_001461", Email: "three_hme@icloud.com", APIToken: "tok-3", APIActive: true, ICloudActive: true, Status: StatusAvailable, CreatedAt: now, UpdatedAt: now},
		},
		ICloudSession: &ICloudSession{
			AccountID: "acc_005175",
			AppleID:   "3579524213@qq.com",
			SavedAt:   now,
			LoginStates: []LoginState{{
				Kind:        LoginStateAppleAccount,
				Scnt:        "scnt-3579",
				APIKey:      "key-3579",
				SavedAt:     now,
				LastCheckOK: true,
			}},
		},
	}
	if err := seed.saveSQLiteLocked(); err != nil {
		seed.mu.Unlock()
		t.Fatalf("saveSQLiteLocked(seed) error = %v", err)
	}
	seed.mu.Unlock()
	if err := seed.Close(); err != nil {
		t.Fatalf("seed.Close() error = %v", err)
	}

	reopened, err := NewFileStore(dbPath)
	if err != nil {
		t.Fatalf("NewFileStore(reopened) error = %v", err)
	}
	defer reopened.Close()

	snap := reopened.Snapshot()
	if snap.ICloudSession != nil {
		t.Fatalf("expected legacy ICloudSession to migrate into ICloudSessions, got %+v", snap.ICloudSession)
	}
	if len(snap.Accounts) != 2 {
		t.Fatalf("accounts count = %d, want 2: %+v", len(snap.Accounts), snap.Accounts)
	}
	accountIDs := map[string]Account{}
	for _, acc := range snap.Accounts {
		accountIDs[acc.ID] = acc
	}
	if _, ok := accountIDs["acc_001461"]; !ok {
		t.Fatalf("expected canonical account acc_001461 to survive, got %+v", snap.Accounts)
	}
	if acc, ok := accountIDs["acc_005175"]; !ok || acc.ICloudStatus != ICloudStatusActive {
		t.Fatalf("expected canonical account acc_005175 with active status, got %+v", acc)
	}
	for _, mbx := range snap.Mailboxes {
		if mbx.AccountID != "acc_001461" {
			t.Fatalf("mailbox %s account_id = %q, want acc_001461", mbx.ID, mbx.AccountID)
		}
	}

	// Now log in the second Apple ID in global/sidecar mode (ownerID == "").
	err = reopened.SaveICloudSessionForOwner("", ICloudSession{
		AppleID: "1055096752@qq.com",
		SavedAt: now,
		LoginStates: []LoginState{{
			Kind:        LoginStateAppleAccount,
			Scnt:        "scnt-1055",
			APIKey:      "key-1055",
			SavedAt:     now,
			LastCheckOK: true,
		}},
	})
	if err != nil {
		t.Fatalf("SaveICloudSessionForOwner(second) error = %v", err)
	}

	sessions := reopened.ICloudSessionsForOwner("")
	if len(sessions) != 2 {
		t.Fatalf("global sessions = %d, want 2: %+v", len(sessions), sessions)
	}
	byAppleID := map[string]ICloudSession{}
	for _, s := range sessions {
		byAppleID[s.AppleID] = s
	}
	if byAppleID["3579524213@qq.com"].AccountID != "acc_005175" {
		t.Fatalf("first session account_id = %q, want acc_005175", byAppleID["3579524213@qq.com"].AccountID)
	}
	if byAppleID["1055096752@qq.com"].AccountID != "acc_001461" {
		t.Fatalf("second session account_id = %q, want acc_001461", byAppleID["1055096752@qq.com"].AccountID)
	}
	if gotAccounts := reopened.Snapshot().Accounts; len(gotAccounts) != 2 {
		t.Fatalf("accounts after second login = %d, want 2: %+v", len(gotAccounts), gotAccounts)
	}
}

func TestIMAPLoginDomainTypoAndSecondaryPrefixAutoBind(t *testing.T) {
	store, err := NewFileStore(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	defer store.Close()

	now := time.Now()
	if err := store.SaveICloudSessionForOwner("", ICloudSession{
		AppleID: "3579524213@qq.com",
		SavedAt: now,
		LoginStates: []LoginState{{
			Kind:        LoginStateAppleAccount,
			Scnt:        "scnt-3579",
			APIKey:      "key-3579",
			SavedAt:     now,
			LastCheckOK: true,
		}},
	}); err != nil {
		t.Fatalf("SaveICloudSessionForOwner() error = %v", err)
	}

	server := &Server{
		store: store,
		checkIMAPLogin: func(_ context.Context, _, _ string) error {
			return nil
		},
	}

	// 1. Typo @icoud.com must return HTTP 400 (not 502!) with actionable suggestion.
	typoBody, _ := json.Marshal(map[string]string{
		"email":        "l3579524213@icoud.com",
		"app_password": "abcd-efgh-ijkl-mnop",
	})
	typoReq := httptest.NewRequest(http.MethodPost, "/api/icloud/imap-login/save", bytes.NewReader(typoBody))
	typoRec := httptest.NewRecorder()
	server.handleSaveICloudIMAPLogin(typoRec, typoReq)
	if typoRec.Code != http.StatusBadRequest {
		t.Fatalf("typo status = %d, want %d; body = %s", typoRec.Code, http.StatusBadRequest, typoRec.Body.String())
	}
	if !strings.Contains(typoRec.Body.String(), "l3579524213@icloud.com") {
		t.Fatalf("typo response missing corrected domain suggestion: %s", typoRec.Body.String())
	}

	// 2. Valid l3579524213@icloud.com auto-binds onto 3579524213@qq.com's existing session.
	validBody, _ := json.Marshal(map[string]string{
		"email":        "l3579524213@icloud.com",
		"app_password": "abcd-efgh-ijkl-mnop",
	})
	validReq := httptest.NewRequest(http.MethodPost, "/api/icloud/imap-login/save", bytes.NewReader(validBody))
	validRec := httptest.NewRecorder()
	server.handleSaveICloudIMAPLogin(validRec, validReq)
	if validRec.Code != http.StatusOK {
		t.Fatalf("valid save status = %d, want 200; body = %s", validRec.Code, validRec.Body.String())
	}
	sessions := store.ICloudSessionsForOwner("")
	if len(sessions) != 1 {
		t.Fatalf("expected IMAP login to bind into single session, got %d: %+v", len(sessions), sessions)
	}
	imapState, ok := iCloudIMAPLoginState(sessions[0])
	if !ok || imapState.IMAPEmail != "l3579524213@icloud.com" {
		t.Fatalf("expected merged IMAP login state, got ok=%v state=%+v", ok, imapState)
	}

	// 3. Reverse order: save standalone IMAP q1055096752@icloud.com first, then Apple Account 1055096752@qq.com.
	secondIMAPBody, _ := json.Marshal(map[string]string{
		"email":        "q1055096752@icloud.com",
		"app_password": "qrst-uvwx-yzab-cdef",
	})
	secondIMAPReq := httptest.NewRequest(http.MethodPost, "/api/icloud/imap-login/save", bytes.NewReader(secondIMAPBody))
	secondIMAPRec := httptest.NewRecorder()
	server.handleSaveICloudIMAPLogin(secondIMAPRec, secondIMAPReq)
	if secondIMAPRec.Code != http.StatusOK {
		t.Fatalf("second IMAP save status = %d, body = %s", secondIMAPRec.Code, secondIMAPRec.Body.String())
	}
	if err := store.SaveICloudSessionForOwner("", ICloudSession{
		AppleID: "1055096752@qq.com",
		SavedAt: now,
		LoginStates: []LoginState{{
			Kind:        LoginStateAppleAccount,
			Scnt:        "scnt-1055",
			APIKey:      "key-1055",
			SavedAt:     now,
			LastCheckOK: true,
		}},
	}); err != nil {
		t.Fatalf("SaveICloudSessionForOwner(1055) error = %v", err)
	}
	sessions = store.ICloudSessionsForOwner("")
	if len(sessions) != 2 {
		t.Fatalf("expected 2 unified sessions after reverse-order adoption, got %d: %+v", len(sessions), sessions)
	}
	for _, sess := range sessions {
		if !appleAccountLoginSaved(sess) || !iCloudIMAPLoginSaved(sess) {
			t.Fatalf("expected both Apple Account and IMAP states on %s, got %+v", sess.AppleID, sess.LoginStates)
		}
	}
}

func TestMultiAccountConcurrentIMAPCodeFetchAndCreateSettingsInternalAuth(t *testing.T) {
	internalToken := strings.Repeat("t", 32)
	t.Setenv("INTERNAL_SERVICE_TOKEN", internalToken)

	store, err := NewFileStore(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	defer store.Close()

	now := time.Now()
	if err := store.SaveICloudSessionForOwner("", ICloudSession{
		AppleID: "3579524213@qq.com",
		SavedAt: now,
		LoginStates: []LoginState{
			{Kind: LoginStateAppleAccount, Scnt: "scnt-a", APIKey: "key-a", SavedAt: now, LastCheckOK: true},
			{Kind: LoginStateICloudIMAP, IMAPEmail: "l3579524213@icloud.com", IMAPUsername: "l3579524213@icloud.com", IMAPHost: defaultICloudIMAPHost, IMAPPort: defaultICloudIMAPPort, IMAPAppPassword: "pass-aaaa-bbbb-cccc", SavedAt: now, LastCheckOK: true},
		},
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveICloudSessionForOwner("", ICloudSession{
		AppleID: "1055096752@qq.com",
		SavedAt: now,
		LoginStates: []LoginState{
			{Kind: LoginStateAppleAccount, Scnt: "scnt-b", APIKey: "key-b", SavedAt: now, LastCheckOK: true},
			{Kind: LoginStateICloudIMAP, IMAPEmail: "q1055096752@icloud.com", IMAPUsername: "q1055096752@icloud.com", IMAPHost: defaultICloudIMAPHost, IMAPPort: defaultICloudIMAPPort, IMAPAppPassword: "pass-dddd-eeee-ffff", SavedAt: now, LastCheckOK: true},
		},
	}); err != nil {
		t.Fatal(err)
	}

	sessions := store.ICloudSessionsForOwner("")
	if len(sessions) != 2 {
		t.Fatalf("sessions = %d, want 2", len(sessions))
	}
	mbxA, err := store.AddMailboxForOwner("", sessions[0].AccountID, "A", "alias_a@icloud.com")
	if err != nil {
		t.Fatal(err)
	}
	mbxB, err := store.AddMailboxForOwner("", sessions[1].AccountID, "B", "alias_b@icloud.com")
	if err != nil {
		t.Fatal(err)
	}

	// Internal create-settings GET and POST must succeed in 0-user sidecar mode.
	server := &Server{
		cfg:                    Config{APIKey: "global-key"},
		store:                  store,
		mailboxSyncMinInterval: 600 * time.Millisecond,
	}
	savePayload, _ := json.Marshal(map[string]any{
		"label":       "multi",
		"account_ids": []string{sessions[0].AccountID, sessions[1].AccountID},
	})
	saveReq := httptest.NewRequest(http.MethodPost, "/api/create-settings", bytes.NewReader(savePayload))
	saveReq.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
	saveReq.Header.Set("X-Internal-Token", internalToken)
	saveRec := httptest.NewRecorder()
	server.handleSaveCreateSettings(saveRec, saveReq)
	if saveRec.Code != http.StatusOK {
		t.Fatalf("handleSaveCreateSettings status = %d, body = %s", saveRec.Code, saveRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/create-settings", nil)
	getReq.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
	getReq.Header.Set("X-Internal-Token", internalToken)
	getRec := httptest.NewRecorder()
	server.handleCreateSettings(getRec, getReq)
	if getRec.Code != http.StatusOK || !strings.Contains(getRec.Body.String(), sessions[1].AccountID) {
		t.Fatalf("handleCreateSettings status = %d, body = %s", getRec.Code, getRec.Body.String())
	}

	// Verify concurrent IMAP sync across 2 accounts runs in parallel without waiting for each other's throttle!
	entered := make(chan string, 2)
	bothEntered := make(chan struct{})
	var once sync.Once
	server.syncCodeMailboxBatchWithCursor = func(_ context.Context, state LoginState, mailboxes []Mailbox, _ time.Time, _ string, _ int) (iCloudIMAPSyncResult, error) {
		entered <- state.IMAPEmail
		if len(entered) == 2 {
			once.Do(func() { close(bothEntered) })
		}
		select {
		case <-bothEntered:
		case <-time.After(350 * time.Millisecond):
			return iCloudIMAPSyncResult{}, errors.New("accounts serialized instead of syncing concurrently")
		}
		code := "111222"
		if strings.HasPrefix(state.IMAPEmail, "q1055") {
			code = "888999"
		}
		out := make(map[string][]ICloudSyncedMessage, len(mailboxes))
		for _, m := range mailboxes {
			out[m.ID] = []ICloudSyncedMessage{{
				UID:        "10",
				RemoteID:   "imap:10",
				Subject:    "Your verification code is " + code,
				Body:       "Code: " + code,
				From:       "noreply@example.com",
				ReceivedAt: time.Now(),
			}}
		}
		return iCloudIMAPSyncResult{MessagesByMailbox: out, LastUID: "10"}, nil
	}

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, item := range []struct {
		mbx      Mailbox
		wantCode string
	}{
		{mbx: mbxA, wantCode: "111222"},
		{mbx: mbxB, wantCode: "888999"},
	} {
		wg.Add(1)
		go func(mbx Mailbox, wantCode string) {
			defer wg.Done()
			count, syncErr := server.syncMailbox(context.Background(), mbx, time.Time{}, "")
			if syncErr != nil {
				errs <- syncErr
				return
			}
			if count != 1 {
				errs <- errors.New("unexpected synced count")
				return
			}
			msgs := store.MessagesForMailbox(mbx.ID)
			if len(msgs) != 1 || extractOTP(msgs[0].Subject+"\n"+msgs[0].Body) != wantCode {
				errs <- errors.New("unexpected OTP code routed to mailbox")
			}
		}(item.mbx, item.wantCode)
	}
	wg.Wait()
	close(errs)
	for syncErr := range errs {
		if syncErr != nil {
			t.Fatalf("concurrent multi-account sync failed: %v", syncErr)
		}
	}
}

func TestProtocolLoginSetupValidate421RedactsTrustTokensAndExplainsWebSetup(t *testing.T) {
	const rawSecretTrustToken = "HSARMTKNSRVXWFla_SUPER_SECRET_TRUST_TOKEN_12345"
	setupServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/accountLogin":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"dsInfo": map[string]any{
					"dsid":         "21500000000",
					"appleId":      "3579524213@qq.com",
					"primaryEmail": "3579524213@qq.com",
				},
				"termsUpdateNeeded": true,
			})
		case "/validate":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusMisdirectedRequest)
			_, _ = w.Write([]byte(`{"success":false,"trustTokens":["` + rawSecretTrustToken + `"]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer setupServer.Close()

	client := &AppleAuthClient{httpClient: setupServer.Client()}
	session := &appleAuthSession{
		Endpoints: appleAuthEndpoints{
			Home:  "https://www.icloud.com.cn",
			Setup: setupServer.URL,
			Host:  "www.icloud.com.cn",
		},
		AppleID:        "3579524213@qq.com",
		AccountCountry: "CHN",
		SessionToken:   "session-token",
		TrustToken:     "trust-token",
	}

	_, err := client.authWithTokenAndValidate(context.Background(), session)
	if err == nil {
		t.Fatal("expected icloud_web_setup_required error")
	}
	if strings.Contains(err.Error(), rawSecretTrustToken) {
		t.Fatalf("error leaked raw trustTokens: %q", err.Error())
	}
	var coded codedError
	if !errors.As(err, &coded) || coded.code != "icloud_web_setup_required" {
		t.Fatalf("expected coded icloud_web_setup_required error, got %#v (%v)", err, err)
	}
	if !strings.Contains(err.Error(), "www.icloud.com.cn") || !strings.Contains(err.Error(), "新接口") {
		t.Fatalf("expected actionable Chinese instructions in error, got %q", err.Error())
	}
}
