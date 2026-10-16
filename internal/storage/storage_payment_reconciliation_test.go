package storage

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestPaymentReconciliationRunLifecycleIsDurableAndIdempotent(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	run := PaymentReconciliationRunRecord{ID: uuid.NewString(), ChannelID: "channel-1", ChannelVersionID: "version-1", BillDate: "2026-08-29", Status: PaymentReconciliationStatusPending, CreatedAt: now, UpdatedAt: now}
	stored, created, err := backend.CreateOrLoadPaymentReconciliationRun(run)
	if err != nil || !created || stored.ID != run.ID {
		t.Fatalf("create = %#v, %v, %v", stored, created, err)
	}
	duplicate := run
	duplicate.ID = uuid.NewString()
	stored, created, err = backend.CreateOrLoadPaymentReconciliationRun(duplicate)
	if err != nil || created || stored.ID != run.ID {
		t.Fatalf("duplicate = %#v, %v, %v", stored, created, err)
	}
	claimed, err := backend.ClaimPaymentReconciliationRun(run.ID, now)
	if err != nil || !claimed {
		t.Fatalf("claim = %v, %v", claimed, err)
	}
	finished := now
	run.Status, run.HashType, run.HashValue, run.ArchivePath = PaymentReconciliationStatusSucceeded, "SHA1", "digest", "bill.csv"
	run.BillRows, run.MatchedOrders, run.FinishedAt, run.UpdatedAt = 1, 1, finished, finished
	item := PaymentReconciliationItemRecord{ID: uuid.NewString(), RunID: run.ID, Category: "amount_mismatch", OutTradeNo: "ST1", CreatedAt: now}
	if err := backend.CompletePaymentReconciliationRun(run, []PaymentReconciliationItemRecord{item}); err != nil {
		t.Fatal(err)
	}
	loaded, err := backend.LoadPaymentReconciliationRun(run.ID)
	if err != nil || loaded.Status != PaymentReconciliationStatusSucceeded || loaded.BillRows != 1 {
		t.Fatalf("loaded=%#v err=%v", loaded, err)
	}
	items, total, err := backend.QueryPaymentReconciliationItems(run.ID, PaymentReconciliationItemFilter{Page: 1, PageSize: 10, Category: "amount_mismatch"})
	if err != nil || total != 1 || len(items) != 1 || items[0].OutTradeNo != "ST1" {
		t.Fatalf("items=%#v total=%d err=%v", items, total, err)
	}
	if _, _, err := backend.QueryPaymentReconciliationItems("missing-run", PaymentReconciliationItemFilter{}); !errors.Is(err, ErrPaymentRecordNotFound) {
		t.Fatalf("missing run error=%v", err)
	}
}

func TestResetInterruptedPaymentReconciliationsAllowsRetry(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	run := PaymentReconciliationRunRecord{ID: uuid.NewString(), ChannelID: "channel-1", ChannelVersionID: "version-1", BillDate: "2026-08-29", Status: PaymentReconciliationStatusPending, CreatedAt: now, UpdatedAt: now}
	if _, _, err := backend.CreateOrLoadPaymentReconciliationRun(run); err != nil {
		t.Fatal(err)
	}
	if claimed, err := backend.ClaimPaymentReconciliationRun(run.ID, now); err != nil || !claimed {
		t.Fatalf("claim=%v err=%v", claimed, err)
	}
	if count, err := backend.ResetInterruptedPaymentReconciliations(now); err != nil || count != 1 {
		t.Fatalf("reset=%d err=%v", count, err)
	}
	if claimed, err := backend.ClaimPaymentReconciliationRun(run.ID, now); err != nil || !claimed {
		t.Fatalf("retry claim=%v err=%v", claimed, err)
	}
}
