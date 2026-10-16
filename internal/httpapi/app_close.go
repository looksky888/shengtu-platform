package httpapi

import (
	"context"
	"errors"
	"fmt"
	"time"
)

func (a *App) Close() error {
	var taskErr error
	// Stop image tasks first so in-flight work can finish or cancel with terminal state (F-03).
	if a.closeTasks != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		taskErr = a.closeTasks(shutdownCtx)
		cancel()
		if taskErr != nil && a.logger != nil {
			a.logger.Error("image task shutdown persistence failed", "error", taskErr)
		}
	}
	if a.cancel != nil {
		a.cancel()
	}
	var paymentErr error
	if a.paymentOrders != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		paymentErr = a.paymentOrders.CloseReconciliation(shutdownCtx)
		if recoveryErr := a.paymentOrders.Close(shutdownCtx); paymentErr == nil {
			paymentErr = recoveryErr
		} else if recoveryErr != nil {
			paymentErr = errors.Join(paymentErr, recoveryErr)
		}
		cancel()
		if paymentErr != nil && a.logger != nil {
			a.logger.Error("payment order recovery shutdown failed", "error", paymentErr)
		}
	}
	var backupErr error
	if a.backup != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		backupErr = a.backup.Close(shutdownCtx)
		cancel()
		if backupErr != nil && a.logger != nil {
			a.logger.Error("backup shutdown failed", "error", backupErr)
		}
	}
	var loggerErr error
	var usageLogErr error
	if a.closeUsage != nil {
		usageLogErr = a.closeUsage()
		if usageLogErr != nil && a.logger != nil {
			a.logger.Error("usage aggregate shutdown flush failed", "error", usageLogErr)
		}
	}
	if a.closeLog != nil {
		loggerErr = a.closeLog()
	}
	var storageErr error
	if a.closeStorage != nil {
		storageErr = a.closeStorage()
	}
	return errors.Join(
		wrapCloseError("close image tasks", taskErr),
		wrapCloseError("close payment recovery", paymentErr),
		wrapCloseError("close backup", backupErr),
		wrapCloseError("flush usage aggregate", usageLogErr),
		wrapCloseError("close logger", loggerErr),
		wrapCloseError("close storage backend", storageErr),
	)
}

func wrapCloseError(operation string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", operation, err)
}
