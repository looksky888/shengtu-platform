package service

import (
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/util"
)

func TestPruneQuarantinePrefersDroppingTemporary(t *testing.T) {
	// Newest-first: [perm-new, temp-old-ish, temp-oldest] with max=2 should drop temp-oldest first.
	list := []quarantineEntry{
		{AccessToken: "p1", Grade: string(DisposalPermanent), TokenHash: "p1"},
		{AccessToken: "t1", Grade: string(DisposalTemporary), TokenHash: "t1"},
		{AccessToken: "t0", Grade: string(DisposalTemporary), TokenHash: "t0"},
	}
	got := pruneQuarantineEntries(list, 2)
	if len(got) != 2 {
		t.Fatalf("len=%d want 2: %#v", len(got), got)
	}
	// Oldest temporary t0 should be gone; permanent kept.
	ids := map[string]bool{}
	for _, e := range got {
		ids[e.AccessToken] = true
	}
	if !ids["p1"] || !ids["t1"] || ids["t0"] {
		t.Fatalf("prefer keep permanent + newer temp, got %#v", got)
	}
}

func TestQuarantineCapEnforcedOnAppend(t *testing.T) {
	t.Setenv("CHATGPT2API_QUARANTINE_MAX_ENTRIES", "3")
	accounts := newTestAccountService(t)
	dir := t.TempDir()
	accounts.InitQuarantinePath(dir)
	if accounts.quarantineMax() != 3 {
		t.Fatalf("max=%d want 3", accounts.quarantineMax())
	}
	for i, tok := range []string{"a", "b", "c", "d"} {
		accounts.AddAccounts([]string{tok})
		grade := DisposalTemporary
		if i%2 == 0 {
			grade = DisposalPermanent
		}
		if err := accounts.quarantineThenRemove(tok, "test", "cap", grade); err != nil {
			t.Fatal(err)
		}
	}
	list := accounts.ListQuarantine()
	if len(list) != 3 {
		t.Fatalf("quarantine len=%d want 3: %#v", len(list), list)
	}
	count, max := accounts.QuarantineStats()
	if count != 3 || max != 3 {
		t.Fatalf("stats count=%d max=%d", count, max)
	}
}

func TestListQuarantineListTypedGradeFilter(t *testing.T) {
	accounts := newTestAccountService(t)
	dir := t.TempDir()
	accounts.InitQuarantinePath(dir)
	// temporary
	accounts.AddAccounts([]string{"tok-t1"})
	_, _ = accounts.UpdateAccount("tok-t1", map[string]any{"status": "正常", "quota": 1, "email": "t1@t.com"})
	if action := accounts.disposeAccount("tok-t1", "test", "rate_limit", DisposalTemporary); action != DisposeQuarantinedTemporary {
		t.Fatalf("temp action=%q", action)
	}
	// permanent
	accounts.AddAccounts([]string{"tok-p1"})
	_, _ = accounts.UpdateAccount("tok-p1", map[string]any{"status": "正常", "quota": 1, "email": "p1@t.com"})
	if err := accounts.quarantineThenRemove("tok-p1", "test", "token_expired", DisposalPermanent); err != nil {
		t.Fatal(err)
	}
	all := accounts.ListQuarantineListTyped("")
	if all.TemporaryCount != 1 || all.PermanentCount != 1 {
		t.Fatalf("counts temp=%d perm=%d all=%#v", all.TemporaryCount, all.PermanentCount, all)
	}
	if len(all.Items) != 2 {
		t.Fatalf("all items=%d", len(all.Items))
	}
	temp := accounts.ListQuarantineListTyped("temporary")
	if temp.Total != 1 || len(temp.Items) != 1 || temp.Items[0].Grade != "temporary" {
		t.Fatalf("temp list %#v", temp)
	}
	if temp.TemporaryCount != 1 || temp.PermanentCount != 1 {
		t.Fatalf("filtered list should still report full cabin counts: %#v", temp)
	}
	perm := accounts.ListQuarantineListTyped("permanent")
	if perm.Total != 1 || perm.Items[0].Grade != "permanent" {
		t.Fatalf("perm list %#v", perm)
	}
}

func TestPurgeQuarantinePermanentOnly(t *testing.T) {
	accounts := newTestAccountService(t)
	dir := t.TempDir()
	accounts.InitQuarantinePath(dir)
	accounts.AddAccounts([]string{"tok-t", "tok-p"})
	_, _ = accounts.UpdateAccount("tok-t", map[string]any{"status": "正常", "quota": 1, "email": "t@t.com"})
	_, _ = accounts.UpdateAccount("tok-p", map[string]any{"status": "正常", "quota": 1, "email": "p@t.com"})
	_ = accounts.disposeAccount("tok-t", "test", "rate_limit", DisposalTemporary)
	_ = accounts.quarantineThenRemove("tok-p", "test", "token_expired", DisposalPermanent)

	list := accounts.ListQuarantine()
	var tempHash, permHash string
	for _, row := range list {
		if row["grade"] == "temporary" {
			tempHash, _ = row["token_hash"].(string)
		}
		if row["grade"] == "permanent" {
			permHash, _ = row["token_hash"].(string)
		}
	}
	if tempHash == "" || permHash == "" {
		t.Fatalf("missing hashes temp=%q perm=%q list=%#v", tempHash, permHash, list)
	}
	// temporary reject when permanentOnly
	bad := accounts.PurgeQuarantine(tempHash, true)
	if util.ToBool(bad["purged"]) {
		t.Fatal("must not purge temporary with permanentOnly")
	}
	ok := accounts.PurgeQuarantine(permHash, true)
	if !util.ToBool(ok["purged"]) {
		t.Fatalf("purge permanent failed: %#v", ok)
	}
	after := accounts.ListQuarantineListTyped("")
	if after.PermanentCount != 0 || after.TemporaryCount != 1 {
		t.Fatalf("after purge counts %#v", after)
	}
	if accounts.GetAccount("tok-p") != nil {
		t.Fatal("purged permanent token must not be in pool")
	}
}

func TestPurgePermanentQuarantineAllKeepsTemporaryAndRemovesPoolCopies(t *testing.T) {
	accounts := newTestAccountService(t)
	dir := t.TempDir()
	accounts.InitQuarantinePath(dir)
	accounts.AddAccounts([]string{"bulk-temp", "bulk-perm-1", "bulk-perm-2"})
	_ = accounts.disposeAccount("bulk-temp", "test", "rate_limit", DisposalTemporary)
	_ = accounts.quarantineThenRemove("bulk-perm-1", "test", "token_expired", DisposalPermanent)
	_ = accounts.quarantineThenRemove("bulk-perm-2", "test", "token_expired", DisposalPermanent)
	accounts.AddAccounts([]string{"bulk-perm-1"})

	result := accounts.PurgePermanentQuarantineAllTyped()
	if result.Requested != 2 || result.Purged != 2 || result.Failed != 0 {
		t.Fatalf("bulk purge result = %#v", result)
	}
	list := accounts.ListQuarantineListTyped("")
	if list.PermanentCount != 0 || list.TemporaryCount != 1 {
		t.Fatalf("bulk purge counts = %#v", list)
	}
	if accounts.GetAccount("bulk-perm-1") != nil || accounts.GetAccount("bulk-perm-2") != nil {
		t.Fatal("bulk purged accounts must not remain in active pool")
	}
}

func TestPurgePermanentQuarantineAllRestoresFailedPoolDelete(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"bulk-fail"})
	if err := accounts.quarantineThenRemove("bulk-fail", "test", "token_expired", DisposalPermanent); err != nil {
		t.Fatal(err)
	}
	accounts.AddAccounts([]string{"bulk-fail"})
	backend.failDelete = true

	result := accounts.PurgePermanentQuarantineAllTyped()
	if result.Requested != 1 || result.Purged != 0 || result.Failed != 1 {
		t.Fatalf("bulk failure result = %#v", result)
	}
	if len(accounts.ListQuarantine()) != 1 || accounts.GetAccount("bulk-fail") == nil {
		t.Fatal("failed bulk purge must preserve cabin row and active pool copy")
	}
}

func TestReconcileQuarantinePoolRemovesDualPresence(t *testing.T) {
	accounts := newTestAccountService(t)
	dir := t.TempDir()
	// Init reconciles empty cabin first.
	accounts.InitQuarantinePath(dir)
	accounts.AddAccounts([]string{"tok-dual"})
	_, _ = accounts.UpdateAccount("tok-dual", map[string]any{"status": "正常", "quota": 2, "email": "dual@t.com"})
	// Simulate crash after cabin write, before pool delete: inject cabin row while token stays in pool.
	path := accounts.quarantinePath
	if err := accounts.appendQuarantine(path, quarantineEntry{
		AccessToken: "tok-dual",
		Email:       "dual@t.com",
		TokenHash:   shortTokenHash("tok-dual"),
		Grade:       string(DisposalPermanent),
		RemovedAt:   "2026-07-25 00:00:00",
		Source:      "crash-sim",
	}); err != nil {
		t.Fatal(err)
	}
	if accounts.GetAccount("tok-dual") == nil {
		t.Fatal("token should still be in pool before reconcile")
	}
	n, err := accounts.ReconcileQuarantinePool()
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("reconcile removed=%d want 1", n)
	}
	if accounts.GetAccount("tok-dual") != nil {
		t.Fatal("dual-presence token must leave pool after reconcile")
	}
	if len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("cabin should keep the token: %#v", accounts.ListQuarantine())
	}
}

func TestQuarantineThenRemoveKeepsPoolOnWriteFailure(t *testing.T) {
	accounts := newTestAccountService(t)
	// Unwritable quarantine path: write fails, account must remain in pool.
	accounts.InitQuarantinePath(filepath.Join(t.TempDir(), "no-such-parent", "nested"))
	// Make parent a file so MkdirAll/write fails... simpler: set path to a file path under a file.
	// Use a path whose parent is a file.
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	accounts.quarantinePath = filepath.Join(blocker, "account_quarantine.json")

	accounts.AddAccounts([]string{"token-keep"})
	_, _ = accounts.UpdateAccount("token-keep", map[string]any{"status": "正常", "quota": 3})
	err := accounts.quarantineThenRemove("token-keep", "test", "token_expired", DisposalPermanent)
	if err == nil {
		t.Fatal("expected quarantine write failure")
	}
	if accounts.GetAccount("token-keep") == nil {
		t.Fatal("account must stay in pool when cabin write fails")
	}
}
