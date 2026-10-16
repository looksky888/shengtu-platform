package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"
)

func TestApplyMessageSyncCommitsMessagesAndCursors(t *testing.T) {
	store, statePath := newMessageSyncTestStore(t)
	now := time.Now().UTC().Truncate(time.Second)
	created, err := store.applyMessageSync([]mailboxMessageSync{{
		MailboxID: "mailbox-1",
		Messages: []syncedMessageInput{
			{RemoteID: "remote-1", Source: "imap", Subject: "code 111111", Body: "first", ReceivedAt: now.Add(-time.Minute)},
			{RemoteID: "remote-2", Source: "imap", Subject: "code 222222", Body: "second", ReceivedAt: now},
		},
		UpdateCursor: true,
		SyncedAt:     now,
		LastUID:      "22",
	}}, &iCloudIMAPSyncCursorUpdate{
		OwnerID: "owner-1", AccountID: "account-1", SyncedAt: now, LastUID: "22",
	})
	if err != nil {
		t.Fatalf("applyMessageSync() error = %v", err)
	}
	if created != 2 {
		t.Fatalf("created = %d, want 2", created)
	}

	created, err = store.applyMessageSync([]mailboxMessageSync{{
		MailboxID: "mailbox-1",
		Messages: []syncedMessageInput{
			{RemoteID: "remote-1", Source: "imap", Subject: "code 111111", Body: "updated", ReceivedAt: now},
			{RemoteID: "remote-3", Source: "imap", Subject: "code 333333", Body: "third", ReceivedAt: now},
		},
	}}, nil)
	if err != nil {
		t.Fatalf("second applyMessageSync() error = %v", err)
	}
	if created != 1 {
		t.Fatalf("second created = %d, want 1", created)
	}

	state := store.Snapshot()
	if len(state.Messages) != 3 || state.Mailboxes[0].ReceiveCount != 3 || state.Mailboxes[0].LastSyncUID != "22" {
		t.Fatalf("state after sync = %#v", state)
	}
	if state.Messages[0].Body != "updated" {
		t.Fatalf("existing message body = %q", state.Messages[0].Body)
	}
	if got := state.ICloudSessions[0].LoginStates[0].IMAPLastSyncUID; got != "22" {
		t.Fatalf("IMAP cursor = %q, want 22", got)
	}

	reloaded, err := NewFileStore(statePath)
	if err != nil {
		t.Fatalf("reload store: %v", err)
	}
	wantJSON, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	gotJSON, err := json.Marshal(reloaded.Snapshot())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(gotJSON, wantJSON) {
		t.Fatalf("reloaded state differs\ngot:  %s\nwant: %s", gotJSON, wantJSON)
	}
}

func TestApplyMessageSyncPrunesOnlyAffectedMailbox(t *testing.T) {
	store, _ := newMessageSyncTestStore(t)
	store.configureMessageRetention(30, 3)
	now := time.Now().UTC().Truncate(time.Second)
	store.mu.Lock()
	store.state.Messages = append(store.state.Messages, Message{
		ID: "other-old", MailboxID: "mailbox-2", RemoteID: "other", ReceivedAt: now.Add(-90 * 24 * time.Hour), CreatedAt: now,
	})
	if err := store.saveLocked(); err != nil {
		store.mu.Unlock()
		t.Fatal(err)
	}
	store.mu.Unlock()

	inputs := make([]syncedMessageInput, 0, 6)
	for i := 0; i < 5; i++ {
		inputs = append(inputs, syncedMessageInput{
			RemoteID: fmt.Sprintf("remote-%d", i), Subject: "code 123456", ReceivedAt: now.Add(-time.Duration(i) * time.Hour),
		})
	}
	inputs = append(inputs, syncedMessageInput{RemoteID: "expired", Subject: "code 654321", ReceivedAt: now.Add(-31 * 24 * time.Hour)})
	if _, err := store.applyMessageSync([]mailboxMessageSync{{MailboxID: "mailbox-1", Messages: inputs}}, nil); err != nil {
		t.Fatalf("applyMessageSync() error = %v", err)
	}

	state := store.Snapshot()
	if len(state.Messages) != 4 {
		t.Fatalf("message count = %d, want 3 retained + 1 unaffected", len(state.Messages))
	}
	kept := map[string]bool{}
	for _, message := range state.Messages {
		kept[message.RemoteID] = true
	}
	for _, remoteID := range []string{"remote-0", "remote-1", "remote-2", "other"} {
		if !kept[remoteID] {
			t.Fatalf("retained messages = %#v, missing %s", kept, remoteID)
		}
	}
	if kept["remote-3"] || kept["remote-4"] || kept["expired"] {
		t.Fatalf("retention kept old/excess messages: %#v", kept)
	}
}

func TestApplyMessageSyncRollsBackWholeBatchOnSaveFailure(t *testing.T) {
	store, statePath := newMessageSyncTestStore(t)
	before := store.Snapshot()
	diskBefore, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	blocker := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(blocker, []byte("block"), 0o600); err != nil {
		t.Fatal(err)
	}
	store.path = filepath.Join(blocker, "state.json")
	now := time.Now()
	_, err = store.applyMessageSync([]mailboxMessageSync{{
		MailboxID:    "mailbox-1",
		Messages:     []syncedMessageInput{{RemoteID: "failed", Subject: "code 123456", ReceivedAt: now}},
		UpdateCursor: true,
		SyncedAt:     now,
		LastUID:      "99",
	}}, &iCloudIMAPSyncCursorUpdate{OwnerID: "owner-1", AccountID: "account-1", SyncedAt: now, LastUID: "99"})
	if err == nil {
		t.Fatal("applyMessageSync() succeeded with invalid persistence path")
	}
	if store.Path() != statePath {
		t.Fatalf("path = %q, want %q", store.Path(), statePath)
	}
	if got := store.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("memory changed after failed batch\ngot:  %#v\nwant: %#v", got, before)
	}
	diskAfter, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(diskAfter, diskBefore) {
		t.Fatal("disk changed after failed batch")
	}
}

func TestLoadConfigMessageRetention(t *testing.T) {
	t.Setenv("IPM_MESSAGE_RETENTION_DAYS", "14")
	t.Setenv("IPM_MESSAGE_RETENTION_PER_MAILBOX", "80")
	cfg, err := LoadConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.MessageRetentionDays != 14 || cfg.MessageRetentionPerMailbox != 80 {
		t.Fatalf("retention config = %d days/%d messages", cfg.MessageRetentionDays, cfg.MessageRetentionPerMailbox)
	}
}

func TestApplyMessageSyncHandlesLargeBatch(t *testing.T) {
	store, _ := newMessageSyncTestStore(t)
	store.configureMessageRetention(3650, 2000)
	now := time.Now()
	inputs := make([]syncedMessageInput, 1000)
	for i := range inputs {
		inputs[i] = syncedMessageInput{
			RemoteID: fmt.Sprintf("large-%04d", i), Subject: "code 123456", ReceivedAt: now.Add(time.Duration(i) * time.Second),
		}
	}
	created, err := store.applyMessageSync([]mailboxMessageSync{{MailboxID: "mailbox-1", Messages: inputs}}, nil)
	if err != nil {
		t.Fatalf("applyMessageSync() error = %v", err)
	}
	if created != len(inputs) || len(store.MessagesForMailbox("mailbox-1")) != len(inputs) {
		t.Fatalf("large batch created/messages = %d/%d, want %d", created, len(store.MessagesForMailbox("mailbox-1")), len(inputs))
	}
}

func TestApplyMessageSyncSerializesConcurrentBatches(t *testing.T) {
	store, _ := newMessageSyncTestStore(t)
	store.configureMessageRetention(3650, 1000)
	const workers = 20
	errors := make(chan error, workers)
	var wait sync.WaitGroup
	for i := 0; i < workers; i++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			_, err := store.applyMessageSync([]mailboxMessageSync{{
				MailboxID: "mailbox-1",
				Messages: []syncedMessageInput{{
					RemoteID: fmt.Sprintf("concurrent-%02d", index), Subject: "code 123456", ReceivedAt: time.Now(),
				}},
			}}, nil)
			errors <- err
		}(i)
	}
	wait.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent applyMessageSync() error = %v", err)
		}
	}
	state := store.Snapshot()
	if len(state.Messages) != workers || state.Mailboxes[0].ReceiveCount != workers {
		t.Fatalf("concurrent state messages/count = %d/%d, want %d", len(state.Messages), state.Mailboxes[0].ReceiveCount, workers)
	}
}

func newMessageSyncTestStore(t *testing.T) (*FileStore, string) {
	t.Helper()
	statePath := filepath.Join(t.TempDir(), "state.json")
	store, err := NewFileStore(statePath)
	if err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	store.state.Mailboxes = []Mailbox{
		{ID: "mailbox-1", OwnerID: "owner-1", AccountID: "account-1", Email: "one@example.test"},
		{ID: "mailbox-2", OwnerID: "owner-1", AccountID: "account-1", Email: "two@example.test"},
	}
	store.state.ICloudSessions = []ICloudSession{{
		OwnerID: "owner-1", AccountID: "account-1",
		LoginStates: []LoginState{{Kind: LoginStateICloudIMAP, IMAPEmail: "owner@example.test"}},
	}}
	if err := store.saveLocked(); err != nil {
		store.mu.Unlock()
		t.Fatal(err)
	}
	store.mu.Unlock()
	return store, statePath
}
