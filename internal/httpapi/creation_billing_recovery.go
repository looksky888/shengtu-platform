package httpapi

import (
	"context"
	"time"

	"chatgpt2api/internal/util"
)

type creationBillingHealth struct {
	LastRunAt string `json:"last_run_at,omitempty"`
	Scanned   int    `json:"scanned"`
	Refunded  int    `json:"refunded"`
	Failed    int    `json:"failed"`
	LastError string `json:"last_error,omitempty"`
}

func (a *App) startCreationBillingReconciliation(ctx context.Context, interval time.Duration) {
	if a == nil || a.tasks == nil || a.credits == nil {
		return
	}
	if interval <= 0 {
		interval = time.Minute
	}
	a.reconcileCreationBilling()
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.reconcileCreationBilling()
			}
		}
	}()
}

func (a *App) reconcileCreationBilling() {
	candidates := a.tasks.FailedBillingCandidates()
	health := creationBillingHealth{LastRunAt: util.NowChina().Format("2006-01-02 15:04:05"), Scanned: len(candidates)}
	for _, candidate := range candidates {
		refunded, err := a.credits.ReconcileCreationCharge(candidate.OwnerID, candidate.ChargeReason, candidate.RefID, candidate.BilledCount, candidate.SuccessCount)
		if err != nil {
			health.Failed++
			health.LastError = err.Error()
			if a.logger != nil {
				a.logger.Warning("creation billing reconciliation failed", "task_id", candidate.TaskID, "user_id", candidate.OwnerID, "error", err.Error())
			}
			continue
		}
		if refunded {
			health.Refunded++
			if a.logger != nil {
				a.logger.Info("creation billing reconciliation refunded", "task_id", candidate.TaskID, "user_id", candidate.OwnerID)
			}
		}
	}
	a.billingMu.Lock()
	a.billingHealth = health
	a.billingMu.Unlock()
}

func (a *App) creationBillingHealthSnapshot() creationBillingHealth {
	if a == nil {
		return creationBillingHealth{}
	}
	a.billingMu.RLock()
	defer a.billingMu.RUnlock()
	return a.billingHealth
}
