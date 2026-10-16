package app

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFileStoreRollsBackMemoryWhenPersistenceFails(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(*testing.T, *FileStore) string
		mutate  func(*FileStore, string) error
	}{
		{
			name: "create user",
			mutate: func(store *FileStore, _ string) error {
				_, err := store.CreateUser("new-user", "Password123")
				return err
			},
		},
		{
			name: "tag mailbox",
			prepare: func(t *testing.T, store *FileStore) string {
				mailbox, err := store.AddMailboxForOwner("owner-1", "account-1", "测试", "tag@example.test")
				if err != nil {
					t.Fatal(err)
				}
				return mailbox.ID
			},
			mutate: func(store *FileStore, mailboxID string) error {
				_, err := store.SetMailboxTag(mailboxID, "GPT 已注册", "green")
				return err
			},
		},
		{
			name: "claim mailbox",
			prepare: func(t *testing.T, store *FileStore) string {
				if _, err := store.AddMailboxForOwner("owner-1", "account-1", "测试", "claim@example.test"); err != nil {
					t.Fatal(err)
				}
				return ""
			},
			mutate: func(store *FileStore, _ string) error {
				_, err := store.ClaimAvailableMailbox("openai", "注册占用中")
				return err
			},
		},
		{
			name: "delete mailbox",
			prepare: func(t *testing.T, store *FileStore) string {
				mailbox, err := store.AddMailboxForOwner("owner-1", "account-1", "测试", "delete@example.test")
				if err != nil {
					t.Fatal(err)
				}
				return mailbox.ID
			},
			mutate: func(store *FileStore, mailboxID string) error {
				return store.DeleteMailbox(mailboxID)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			statePath := filepath.Join(t.TempDir(), "state.json")
			store, err := NewFileStore(statePath)
			if err != nil {
				t.Fatal(err)
			}
			var target string
			if test.prepare != nil {
				target = test.prepare(t, store)
			}
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
			if err := test.mutate(store, target); err == nil {
				t.Fatal("mutation succeeded while persistence path was invalid")
			}
			if store.Path() != statePath {
				t.Fatalf("path = %q, want rollback to %q", store.Path(), statePath)
			}
			if got := store.Snapshot(); !reflect.DeepEqual(got, before) {
				t.Fatalf("memory changed after failed save\ngot:  %#v\nwant: %#v", got, before)
			}
			diskAfter, err := os.ReadFile(statePath)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(diskAfter, diskBefore) {
				t.Fatal("disk changed after failed save")
			}
		})
	}
}
