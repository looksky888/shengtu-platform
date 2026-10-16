package app

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestMailboxTagPersistsAndSurvivesRemoteSync(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := NewFileStore(path)
	if err != nil {
		t.Fatal(err)
	}
	mailbox, err := store.AddMailbox("account-1", "测试", "tag@example.com")
	if err != nil {
		t.Fatal(err)
	}
	mailbox, err = store.SetMailboxTag(mailbox.ID, "GPT 已注册", "green")
	if err != nil {
		t.Fatal(err)
	}
	if mailbox.Tag != "GPT 已注册" || mailbox.TagColor != "green" {
		t.Fatalf("tag = %q/%q", mailbox.Tag, mailbox.TagColor)
	}

	_, _, err = store.UpsertMailboxFromRemote("", "account-1", ICloudRemoteMailbox{
		Email:    mailbox.Email,
		Label:    "远端名称",
		IsActive: true,
	}, "synced")
	if err != nil {
		t.Fatal(err)
	}
	reloaded, err := NewFileStore(path)
	if err != nil {
		t.Fatal(err)
	}
	got, ok := reloaded.FindMailboxByID(mailbox.ID)
	if !ok || got.Tag != "GPT 已注册" || got.TagColor != "green" {
		t.Fatalf("reloaded tag = %q/%q, found=%v", got.Tag, got.TagColor, ok)
	}
}

func TestMailboxTagValidationAndClear(t *testing.T) {
	store, err := NewFileStore(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	mailbox, err := store.AddMailbox("", "测试", "clear@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.SetMailboxTag(mailbox.ID, "标记", "unknown"); err == nil {
		t.Fatal("expected invalid color error")
	}
	if _, err = store.SetMailboxTag(mailbox.ID, strings.Repeat("长", mailboxTagMaxLength+1), "red"); err == nil {
		t.Fatal("expected tag length error")
	}
	if _, err = store.SetMailboxTag(mailbox.ID, "标记", "amber"); err != nil {
		t.Fatal(err)
	}
	cleared, err := store.SetMailboxTag(mailbox.ID, "", "red")
	if err != nil {
		t.Fatal(err)
	}
	if cleared.Tag != "" || cleared.TagColor != "" {
		t.Fatalf("cleared tag = %q/%q", cleared.Tag, cleared.TagColor)
	}
}
