package app

import "testing"

func TestMailboxListSnapshotForOwnerExcludesHeavyState(t *testing.T) {
	store := &FileStore{state: State{
		Users: []User{
			{ID: "user-a", Username: "alice"},
			{ID: "user-b", Username: "bob"},
		},
		Accounts: []Account{
			{ID: "account-a", OwnerID: "user-a", Label: "A"},
			{ID: "account-b", OwnerID: "user-b", Label: "B"},
		},
		Mailboxes: []Mailbox{
			{ID: "mailbox-a", OwnerID: "user-a", Email: "a@icloud.com"},
			{ID: "mailbox-b", OwnerID: "user-b", Email: "b@icloud.com"},
		},
		Messages:       []Message{{ID: "message-a", OwnerID: "user-a", Body: "large body"}},
		ICloudSessions: []ICloudSession{{OwnerID: "user-a", AccountID: "account-a"}},
	}}

	got := store.MailboxListSnapshotForOwner("user-a")
	if len(got.Users) != 1 || got.Users[0].ID != "user-a" {
		t.Fatalf("users = %#v, want only user-a", got.Users)
	}
	if len(got.Accounts) != 1 || got.Accounts[0].ID != "account-a" {
		t.Fatalf("accounts = %#v, want only account-a", got.Accounts)
	}
	if len(got.Mailboxes) != 1 || got.Mailboxes[0].ID != "mailbox-a" {
		t.Fatalf("mailboxes = %#v, want only mailbox-a", got.Mailboxes)
	}
	if len(got.Messages) != 0 || len(got.ICloudSessions) != 0 {
		t.Fatalf("heavy state leaked into list snapshot: messages=%d sessions=%d", len(got.Messages), len(got.ICloudSessions))
	}

	got.Accounts[0].Label = "changed"
	got.Users[0].Username = "changed"
	if store.state.Accounts[0].Label != "A" {
		t.Fatal("snapshot mutation changed store state")
	}
	if store.state.Users[0].Username != "alice" {
		t.Fatal("snapshot user mutation changed store state")
	}
}
