package app

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestSyncMailboxCodeBatchAdvancesCursorForNonOTPMessages(t *testing.T) {
	store, err := NewFileStore(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	store.mu.Lock()
	store.state.Mailboxes = []Mailbox{{
		ID:           "mailbox-1",
		OwnerID:      "owner-1",
		AccountID:    "account-1",
		Email:        "alias1@icloud.com",
		APIActive:    true,
		ICloudActive: true,
		Status:       StatusAvailable,
		LastSyncUID:  "100",
	}}
	store.state.ICloudSessions = []ICloudSession{{
		OwnerID:   "owner-1",
		AccountID: "account-1",
		AppleID:   "owner@icloud.com",
		LoginStates: []LoginState{{
			Kind:            LoginStateICloudIMAP,
			IMAPEmail:       "owner@icloud.com",
			IMAPUsername:    "owner@icloud.com",
			IMAPAppPassword: "abcd-efgh-ijkl-mnop",
			IMAPHost:        "imap.mail.me.com",
			IMAPPort:        993,
			IMAPLastSyncUID: "100",
		}},
	}}
	if err := store.saveLocked(); err != nil {
		store.mu.Unlock()
		t.Fatal(err)
	}
	mailbox := store.state.Mailboxes[0]
	store.mu.Unlock()

	srv := &Server{store: store}
	srv.syncCodeMailboxBatchWithCursor = func(ctx context.Context, state LoginState, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (iCloudIMAPSyncResult, error) {
		return iCloudIMAPSyncResult{
			LastUID: "245",
			MessagesByMailbox: map[string][]ICloudSyncedMessage{
				mailbox.ID: {
					{
						UID:        "245",
						RemoteID:   "imap:245",
						Subject:    "Welcome to Apple Newsletters",
						From:       "news@apple.com",
						Body:       "No verification code in this promotional message.",
						ReceivedAt: time.Now(),
					},
					{
						UID:        "Junk:3",
						RemoteID:   "imap:Junk:3",
						Subject:    "Spam offer",
						From:       "spam@example.com",
						Body:       "Still no code here.",
						ReceivedAt: time.Now(),
					},
				},
			},
		}, nil
	}

	created, err := srv.syncMailboxCodeBatchForOwnerWithLimit(context.Background(), "owner-1", []Mailbox{mailbox}, time.Time{}, "OpenAI", 20)
	if err != nil {
		t.Fatalf("syncMailboxCodeBatchForOwnerWithLimit() error = %v", err)
	}
	if created != 0 {
		t.Fatalf("created = %d, want 0 for non-OTP emails", created)
	}
	updated, ok := store.FindMailboxByID(mailbox.ID)
	if !ok {
		t.Fatal("FindMailboxByID() missing")
	}
	if updated.LastSyncUID != "245" {
		t.Fatalf("updated.LastSyncUID = %q, want 245 (must advance past non-OTP INBOX UID and ignore Junk:3)", updated.LastSyncUID)
	}
	if updated.LastSyncAt.IsZero() {
		t.Fatal("expected updated.LastSyncAt to be populated even when no OTP messages matched")
	}
}

func TestSyncMailboxBatchForOwnerReturnsJoinedErrorWhenAllAccountsFail(t *testing.T) {
	store, err := NewFileStore(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	store.mu.Lock()
	store.state.Mailboxes = []Mailbox{
		{ID: "m1", OwnerID: "owner-1", AccountID: "acc-1", Email: "m1@icloud.com", APIActive: true, ICloudActive: true, Status: StatusAvailable},
		{ID: "m2", OwnerID: "owner-1", AccountID: "acc-2", Email: "m2@icloud.com", APIActive: true, ICloudActive: true, Status: StatusAvailable},
	}
	store.state.ICloudSessions = []ICloudSession{
		{OwnerID: "owner-1", AccountID: "acc-1", AppleID: "one@icloud.com", DSID: "dsid-1", Cookies: []SessionCookie{{Name: "X-APPLE-WEBAUTH-TOKEN", Value: "1"}}, MailBaseURL: "https://p01-mailws.icloud.com"},
		{OwnerID: "owner-1", AccountID: "acc-2", AppleID: "two@icloud.com", DSID: "dsid-2", Cookies: []SessionCookie{{Name: "X-APPLE-WEBAUTH-TOKEN", Value: "2"}}, MailBaseURL: "https://p02-mailws.icloud.com"},
	}
	if err := store.saveLocked(); err != nil {
		store.mu.Unlock()
		t.Fatal(err)
	}
	mailboxes := append([]Mailbox(nil), store.state.Mailboxes...)
	store.mu.Unlock()

	srv := &Server{store: store}
	srv.syncMailboxBatch = func(ctx context.Context, session ICloudSession, mailboxes []Mailbox, after time.Time, keyword string, maxThreads int) (map[string][]ICloudSyncedMessage, error) {
		return nil, errors.New("upstream failed for " + session.AccountID)
	}

	err = srv.syncMailboxBatchForOwnerWithLimit(context.Background(), "owner-1", mailboxes, time.Time{}, "OpenAI", 10)
	if err == nil {
		t.Fatal("expected error when all multi-account web mail sync groups fail, got nil")
	}
}
