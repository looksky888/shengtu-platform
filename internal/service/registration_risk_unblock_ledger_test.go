package service

import (
	"fmt"
	"testing"
)

// 3.21: manual unblock used to delete every Events/Attempts row matching the block key
// inside the window. On a shared/NAT egress that erased co-tenants' registration
// history and reset their subnet quota; only the block row may go.
func TestRegistrationRiskUnblockKeepsLedgerAndCoTenantCounts(t *testing.T) {
	policy := policyWithoutPairCooldown()
	policy.DeviceSuccessLimit = 100
	policy.IPSuccessLimit = 2
	policy.IPDistinctDeviceLimit = 2
	policy.SubnetSuccessLimit = 3
	policy.IPBlockHours = 1
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})

	// Shared /24: IP A trips the IP rule, co-tenant IP B fills the subnet quota.
	if err := q.RecordSuccess("u1", "a@example.com", "203.0.113.7", "dev-1"); err != nil {
		t.Fatal(err)
	}
	if err := q.RecordSuccess("u2", "a@example.com", "203.0.113.7", "dev-2"); err != nil {
		t.Fatal(err)
	}
	if err := q.RecordSuccess("u3", "b@example.com", "203.0.113.8", "dev-3"); err != nil {
		t.Fatal(err)
	}
	if _, err := q.Reserve(riskInput("203.0.113.7", "dev-new", "c@example.com")); riskErrorCode(err) != "ip_device_cluster" {
		t.Fatalf("expected ip_device_cluster, got %v", err)
	}
	blocks, err := q.ActiveBlocks()
	if err != nil || len(blocks) != 1 {
		t.Fatalf("blocks=%#v error=%v", blocks, err)
	}
	if ip, device := q.CountForTest("203.0.113.8", "dev-3"); ip != 1 || device != 1 {
		t.Fatalf("co-tenant counts before unblock ip=%d device=%d", ip, device)
	}

	if deleted, err := q.DeleteBlock(blocks[0].ID); err != nil || !deleted {
		t.Fatalf("DeleteBlock()=(%v, %v)", deleted, err)
	}
	if got := q.EventCountForTest(); got != 3 {
		t.Fatalf("ledger events=%d want 3: unblock must not delete history", got)
	}
	if ip, device := q.CountForTest("203.0.113.8", "dev-3"); ip != 1 || device != 1 {
		t.Fatalf("co-tenant counts changed by unblock: ip=%d device=%d", ip, device)
	}
	// The subnet quota is shared with the co-tenant and must not be reset either.
	if _, err := q.Reserve(riskInput("203.0.113.8", "dev-4", "d@example.com")); riskErrorCode(err) != "subnet_limit" {
		t.Fatalf("subnet quota must survive an unrelated IP unblock: %v", err)
	}
	// The IP block itself is released (the subnet rule is simply still exceeded).
	if _, err := q.Reserve(riskInput("203.0.113.7", "dev-5", "e@example.com")); riskErrorCode(err) == "ip_device_cluster" {
		t.Fatal("manual unblock must release the IP block")
	}
}

// 3.21: unblock stays effective (and survives a reload) without touching history.
func TestRegistrationRiskUnblockKeepsHistoryAndSurvivesReload(t *testing.T) {
	dir := t.TempDir()
	policy := policyWithoutPairCooldown()
	q := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{Policy: policy})
	for i := 0; i < policy.DeviceSuccessLimit; i++ {
		if err := q.RecordSuccess(fmt.Sprintf("u%d", i), "u@example.com", fmt.Sprintf("203.0.113.%d", i+1), "same-device"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := q.Reserve(riskInput("198.51.100.1", "same-device", "blocked@example.com")); riskErrorCode(err) != "device_limit" {
		t.Fatalf("block error=%v", err)
	}
	eventsBefore := q.EventCountForTest()
	blocks, err := q.ActiveBlocks()
	if err != nil || len(blocks) != 1 {
		t.Fatalf("blocks=%#v error=%v", blocks, err)
	}
	if deleted, err := q.DeleteBlock(blocks[0].ID); err != nil || !deleted {
		t.Fatalf("DeleteBlock()=(%v, %v)", deleted, err)
	}
	if got := q.EventCountForTest(); got != eventsBefore {
		t.Fatalf("events=%d want %d: unblock must keep the audit ledger", got, eventsBefore)
	}

	reloaded := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{Policy: policy})
	if _, err := reloaded.Reserve(riskInput("198.51.100.1", "same-device", "allowed@example.com")); err != nil {
		t.Fatalf("manual unblock should allow the next registration: %v", err)
	}
	if got := reloaded.EventCountForTest(); got != eventsBefore+1 {
		t.Fatalf("events after registration=%d want %d", got, eventsBefore+1)
	}
}

// 3.21: pair attempts are kept as well, so the audit trail of the blocked pair stays.
func TestRegistrationRiskUnblockKeepsPairAttempts(t *testing.T) {
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{})
	input := riskInput("203.0.113.30", "pair-device", "user@example.com")
	reserveID, err := q.Reserve(input)
	if err != nil {
		t.Fatal(err)
	}
	_ = q.Release(reserveID)
	if _, err := q.Reserve(input); riskErrorCode(err) != "pair_attempts" {
		t.Fatalf("pair block error=%v", err)
	}
	q.mu.Lock()
	attemptsBefore := len(q.state.Attempts)
	q.mu.Unlock()
	blocks, err := q.ActiveBlocks()
	if err != nil || len(blocks) != 1 {
		t.Fatalf("blocks=%#v error=%v", blocks, err)
	}
	if deleted, err := q.DeleteBlock(blocks[0].ID); err != nil || !deleted {
		t.Fatalf("DeleteBlock()=(%v, %v)", deleted, err)
	}
	q.mu.Lock()
	attemptsAfter := len(q.state.Attempts)
	q.mu.Unlock()
	if attemptsAfter != attemptsBefore {
		t.Fatalf("attempts=%d want %d: unblock must keep the audit ledger", attemptsAfter, attemptsBefore)
	}
	if _, err := q.Reserve(input); err != nil {
		t.Fatalf("pair unblock should allow the next attempt: %v", err)
	}
}
