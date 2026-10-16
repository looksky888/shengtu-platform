package service

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func policyWithoutPairCooldown() RegistrationRiskPolicy {
	policy := DefaultRegistrationRiskPolicy()
	policy.PairAttemptLimit = 1000
	return policy
}

func TestRegistrationRiskDeviceLimitBlocksFor30Days(t *testing.T) {
	policy := policyWithoutPairCooldown()
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
	for i := 0; i < policy.DeviceSuccessLimit; i++ {
		if err := q.RecordSuccess(fmt.Sprintf("u%d", i), "u@example.com", fmt.Sprintf("203.0.113.%d", i+1), "same-device"); err != nil {
			t.Fatal(err)
		}
	}
	_, err := q.Reserve(riskInput("198.51.100.1", "same-device", "next@example.com"))
	riskErr, ok := err.(*RegistrationRiskError)
	if !ok || riskErr.Code != "device_limit" || riskErr.RetryAfter != 30*24*time.Hour {
		t.Fatalf("error=%#v", err)
	}
}

func TestRegistrationRiskDeleteBlockClearsDeviceTriggerWindow(t *testing.T) {
	policy := policyWithoutPairCooldown()
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
	for i := 0; i < policy.DeviceSuccessLimit; i++ {
		if err := q.RecordSuccess(fmt.Sprintf("u%d", i), "u@example.com", fmt.Sprintf("203.0.113.%d", i+1), "same-device"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := q.Reserve(riskInput("198.51.100.1", "same-device", "blocked@example.com")); riskErrorCode(err) != "device_limit" {
		t.Fatalf("block error=%v", err)
	}
	blocks, err := q.ActiveBlocks()
	if err != nil || len(blocks) != 1 {
		t.Fatalf("blocks=%#v error=%v", blocks, err)
	}
	if deleted, err := q.DeleteBlock(blocks[0].ID); err != nil || !deleted {
		t.Fatalf("DeleteBlock()=(%v, %v)", deleted, err)
	}
	if _, err := q.Reserve(riskInput("198.51.100.1", "same-device", "allowed@example.com")); err != nil {
		t.Fatalf("manual unblock should allow next registration: %v", err)
	}
}

func TestRegistrationRiskDeletePairBlockClearsAttempts(t *testing.T) {
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
	blocks, _ := q.ActiveBlocks()
	if len(blocks) != 1 {
		t.Fatalf("blocks=%#v", blocks)
	}
	if deleted, err := q.DeleteBlock(blocks[0].ID); err != nil || !deleted {
		t.Fatalf("DeleteBlock()=(%v, %v)", deleted, err)
	}
	if _, err := q.Reserve(input); err != nil {
		t.Fatalf("pair unblock should clear attempts: %v", err)
	}
}

func TestRegistrationRiskIPNeedsThreeDistinctDevices(t *testing.T) {
	policy := policyWithoutPairCooldown()
	t.Run("three devices block", func(t *testing.T) {
		q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
		for i := 0; i < 3; i++ {
			_ = q.RecordSuccess(fmt.Sprintf("u%d", i), "u@example.com", "203.0.113.8", fmt.Sprintf("dev-%d", i))
		}
		_, err := q.Reserve(riskInput("203.0.113.8", "dev-next", "next@example.com"))
		if riskErrorCode(err) != "ip_device_cluster" {
			t.Fatalf("error=%v", err)
		}
	})
	t.Run("two devices pass", func(t *testing.T) {
		q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
		_ = q.RecordSuccess("u1", "u@example.com", "203.0.113.9", "dev-a")
		_ = q.RecordSuccess("u2", "u@example.com", "203.0.113.9", "dev-a")
		_ = q.RecordSuccess("u3", "u@example.com", "203.0.113.9", "dev-b")
		if _, err := q.Reserve(riskInput("203.0.113.9", "dev-c", "next@example.com")); err != nil {
			t.Fatalf("two distinct devices should pass: %v", err)
		}
	})
}

func TestRegistrationRiskSubnetLimit(t *testing.T) {
	policy := policyWithoutPairCooldown()
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
	for i := 1; i <= policy.SubnetSuccessLimit; i++ {
		_ = q.RecordSuccess(fmt.Sprintf("u%d", i), "u@example.com", fmt.Sprintf("198.51.100.%d", i), fmt.Sprintf("dev-%d", i))
	}
	if _, err := q.Reserve(riskInput("198.51.100.99", "new-device", "next@example.com")); riskErrorCode(err) != "subnet_limit" {
		t.Fatalf("same /24 error=%v", err)
	}
	if _, err := q.Reserve(riskInput("198.51.101.1", "other-device", "next@example.com")); err != nil {
		t.Fatalf("other /24 should pass: %v", err)
	}
}

func TestRegistrationRiskCompoundRule(t *testing.T) {
	base := policyWithoutPairCooldown()
	base.ProxyCIDRs = []string{"203.0.113.0/24"}
	tests := []struct {
		name       string
		email      string
		ip         string
		seenDevice bool
		wantBlock  bool
	}{
		{name: "all three", email: "x@yopmail.com", ip: "203.0.113.2", seenDevice: true, wantBlock: true},
		{name: "normal email", email: "x@example.com", ip: "203.0.113.2", seenDevice: true},
		{name: "not proxy", email: "x@yopmail.com", ip: "198.51.100.2", seenDevice: true},
		{name: "new device", email: "x@yopmail.com", ip: "203.0.113.2"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: base})
			if test.seenDevice {
				_ = q.RecordSuccess("old", "old@example.com", "192.0.2.1", "device")
			}
			_, err := q.Reserve(riskInput(test.ip, "device", test.email))
			if got := riskErrorCode(err) == "compound_risk"; got != test.wantBlock {
				t.Fatalf("blocked=%v error=%v", got, err)
			}
		})
	}
}

func TestRegistrationRiskAttemptsAndBlocksPersist(t *testing.T) {
	dir := t.TempDir()
	now := time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	first := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{Now: clock})
	input := riskInput("203.0.113.30", "persist-device", "user@example.com")
	reserveID, err := first.Reserve(input)
	if err != nil {
		t.Fatal(err)
	}
	first.Release(reserveID)
	second := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{Now: clock})
	if _, err := second.Reserve(input); riskErrorCode(err) != "pair_attempts" {
		t.Fatalf("persisted attempt error=%v", err)
	}
	third := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{Now: clock})
	if err := third.Check(input); riskErrorCode(err) != "pair_attempts" {
		t.Fatalf("persisted block error=%v", err)
	}
	now = now.Add(301 * time.Hour)
	if _, err := third.Reserve(input); err != nil {
		t.Fatalf("expired block should pass: %v", err)
	}
}

func TestRegistrationRiskConcurrentReserveDoesNotOvershoot(t *testing.T) {
	policy := policyWithoutPairCooldown()
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
	var success atomic.Int32
	var pendingDenied atomic.Int32
	var group sync.WaitGroup
	reserveIDs := make(chan string, 20)
	for i := 0; i < 20; i++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			input := riskInput(fmt.Sprintf("10.%d.0.1", index), "shared-device", fmt.Sprintf("u%d@example.com", index))
			if reserveID, err := q.Reserve(input); err == nil {
				success.Add(1)
				reserveIDs <- reserveID
			} else if riskErrorCode(err) == "device_capacity_pending" {
				pendingDenied.Add(1)
			}
		}(i)
	}
	group.Wait()
	close(reserveIDs)
	if got := success.Load(); got != int32(policy.DeviceSuccessLimit) {
		t.Fatalf("successful reserves=%d want %d", got, policy.DeviceSuccessLimit)
	}
	if got := pendingDenied.Load(); got != 20-int32(policy.DeviceSuccessLimit) {
		t.Fatalf("pending denials=%d", got)
	}
	if blocks, err := q.ActiveBlocks(); err != nil || len(blocks) != 0 {
		t.Fatalf("pending reservations created long block: blocks=%#v error=%v", blocks, err)
	}
	for reserveID := range reserveIDs {
		if err := q.Release(reserveID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := q.Reserve(riskInput("192.0.2.10", "shared-device", "after-release@example.com")); err != nil {
		t.Fatalf("released pending slots should allow registration: %v", err)
	}
}

func TestRegistrationRiskCountsOnlyBoundSuccesses(t *testing.T) {
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policyWithoutPairCooldown()})
	input := riskInput("203.0.113.50", "pending-device", "pending@example.com")
	reserveID, err := q.Reserve(input)
	if err != nil {
		t.Fatal(err)
	}
	if ipCount, deviceCount := q.CountForTest(input.ClientIP, input.DeviceID); ipCount != 0 || deviceCount != 0 {
		t.Fatalf("pending reservation counted as success: ip=%d device=%d", ipCount, deviceCount)
	}
	if err := q.Bind(reserveID, "user-1", input.Email); err != nil {
		t.Fatal(err)
	}
	if ipCount, deviceCount := q.CountForTest(input.ClientIP, input.DeviceID); ipCount != 1 || deviceCount != 1 {
		t.Fatalf("bound registration not counted: ip=%d device=%d", ipCount, deviceCount)
	}
}

func TestRegistrationRiskIPPendingCapacityDoesNotCreateBlock(t *testing.T) {
	policy := policyWithoutPairCooldown()
	policy.DeviceSuccessLimit = 100
	policy.SubnetSuccessLimit = 100
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
	for i := 0; i < policy.IPSuccessLimit; i++ {
		if _, err := q.Reserve(riskInput("203.0.113.60", fmt.Sprintf("device-%d", i), fmt.Sprintf("u%d@example.com", i))); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := q.Reserve(riskInput("203.0.113.60", "next-device", "next@example.com")); riskErrorCode(err) != "ip_capacity_pending" {
		t.Fatalf("error=%v", err)
	}
	if blocks, err := q.ActiveBlocks(); err != nil || len(blocks) != 0 {
		t.Fatalf("pending IP capacity created long block: blocks=%#v error=%v", blocks, err)
	}
}

func TestRegistrationRiskSubnetPendingCapacity(t *testing.T) {
	policy := policyWithoutPairCooldown()
	policy.DeviceSuccessLimit = 100
	policy.IPSuccessLimit = 100
	policy.IPDistinctDeviceLimit = 100
	policy.SubnetSuccessLimit = 3
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Policy: policy})
	for i := 1; i <= policy.SubnetSuccessLimit; i++ {
		if _, err := q.Reserve(riskInput(fmt.Sprintf("198.51.100.%d", i), fmt.Sprintf("device-%d", i), fmt.Sprintf("u%d@example.com", i))); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := q.Reserve(riskInput("198.51.100.99", "next-device", "next@example.com")); riskErrorCode(err) != "subnet_capacity_pending" {
		t.Fatalf("error=%v", err)
	}
}
