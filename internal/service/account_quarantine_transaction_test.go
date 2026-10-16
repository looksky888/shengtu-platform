package service

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type quarantineMutationFailureBackend struct {
	*storage.JSONBackend
	failUpsert bool
	failDelete bool
}

func (b *quarantineMutationFailureBackend) UpsertAccount(accessToken string, data map[string]any) error {
	if b.failUpsert {
		return errors.New("forced account upsert failure")
	}
	return b.JSONBackend.UpsertAccount(accessToken, data)
}

func (b *quarantineMutationFailureBackend) DeleteAccount(accessToken string) error {
	if b.failDelete {
		return errors.New("forced account delete failure")
	}
	return b.JSONBackend.DeleteAccount(accessToken)
}

func newQuarantineFailureService(t *testing.T) (*AccountService, *quarantineMutationFailureBackend, string) {
	t.Helper()
	dir := t.TempDir()
	backend := &quarantineMutationFailureBackend{JSONBackend: storage.NewJSONBackend(
		filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"),
	)}
	service := NewAccountService(backend, testAccountConfig{}, NewProxyService(testAccountConfig{}), NewLogService(dir))
	if err := service.InitQuarantinePath(dir); err != nil {
		t.Fatal(err)
	}
	return service, backend, dir
}

func TestRestoreQuarantineRollsBackCabinWhenPoolSaveFails(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"restore-token"})
	if err := accounts.quarantineThenRemove("restore-token", "test", "temporary", DisposalTemporary); err != nil {
		t.Fatal(err)
	}
	entry := accounts.temporaryQuarantineForProbe()[0]
	backend.failUpsert = true

	result := accounts.RestoreQuarantine(entry.TokenHash)
	if util.ToBool(result["restored"]) || util.Clean(result["error"]) == "" {
		t.Fatalf("restore result = %#v", result)
	}
	if accounts.GetAccount("restore-token") != nil || len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("failed restore must keep cabin authority: pool=%#v cabin=%#v", accounts.GetAccount("restore-token"), accounts.ListQuarantine())
	}
}

func TestPurgeQuarantineRollsBackCabinWhenPoolDeleteFails(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"purge-token"})
	if err := accounts.quarantineThenRemove("purge-token", "test", "permanent", DisposalPermanent); err != nil {
		t.Fatal(err)
	}
	entry := accounts.ListQuarantine()[0]
	accounts.AddAccounts([]string{"purge-token"})
	backend.failDelete = true

	result := accounts.PurgeQuarantine(util.Clean(entry["token_hash"]), true)
	if util.ToBool(result["purged"]) || util.Clean(result["error"]) == "" {
		t.Fatalf("purge result = %#v", result)
	}
	if accounts.GetAccount("purge-token") == nil || len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("failed purge must restore cabin and keep pool: pool=%#v cabin=%#v", accounts.GetAccount("purge-token"), accounts.ListQuarantine())
	}
}

func TestInitQuarantinePathReturnsReconcileFailure(t *testing.T) {
	accounts, backend, dir := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"dual-token"})
	if err := accounts.appendQuarantine(accounts.quarantinePath, quarantineEntry{
		AccessToken: "dual-token", TokenHash: shortTokenHash("dual-token"), Grade: string(DisposalPermanent),
	}); err != nil {
		t.Fatal(err)
	}
	backend.failDelete = true
	if err := accounts.InitQuarantinePath(dir); err == nil {
		t.Fatal("InitQuarantinePath succeeded while reconcile persistence failed")
	}
	if accounts.GetAccount("dual-token") == nil {
		t.Fatal("failed reconcile must keep pool account")
	}
}

func TestInitQuarantinePathRejectsCorruptCabin(t *testing.T) {
	accounts, _, dir := newQuarantineFailureService(t)
	if err := os.WriteFile(filepath.Join(dir, quarantineFileName), []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	accounts.quarantineCacheOK = false
	if err := accounts.InitQuarantinePath(dir); err == nil {
		t.Fatal("InitQuarantinePath succeeded with corrupt cabin")
	}
}

func TestFinalizeTemporaryRestoreReQuarantinesOnUpdateFailure(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"auto-token"})
	if err := accounts.quarantineThenRemove("auto-token", "test", "temporary", DisposalTemporary); err != nil {
		t.Fatal(err)
	}
	entry := accounts.temporaryQuarantineForProbe()[0]
	if result := accounts.RestoreQuarantineAuto(entry.TokenHash); !util.ToBool(result["restored"]) {
		t.Fatalf("restore failed: %#v", result)
	}
	backend.failUpsert = true
	if err := accounts.finalizeTemporaryQuarantineRestore(entry, map[string]any{"status": "正常", "quota": 5}); err == nil {
		t.Fatal("finalize succeeded while account update persistence failed")
	}
	if accounts.GetAccount("auto-token") != nil || len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("failed finalize must re-quarantine: pool=%#v cabin=%#v", accounts.GetAccount("auto-token"), accounts.ListQuarantine())
	}
}
