package httpapi

import (
	"errors"
	"fmt"

	"chatgpt2api/internal/service"
)

type emailRegistrationFinalizeError struct {
	operation string
	primary   error
	rollback  error
}

func (e *emailRegistrationFinalizeError) Error() string {
	if e.rollback != nil {
		return fmt.Sprintf("%s失败: %v；补偿回滚失败: %v", e.operation, e.primary, e.rollback)
	}
	return fmt.Sprintf("%s失败: %v", e.operation, e.primary)
}

func (e *emailRegistrationFinalizeError) Unwrap() error { return e.primary }

func (a *App) completeEmailRegistration(reserveID, verificationID, email, password, name string, rememberMe bool) (*service.Identity, string, error) {
	identity, token, err := a.auth.RegisterEmailUserWithRemember(email, password, name, rememberMe)
	if err != nil {
		if a.regQuota != nil {
			if releaseErr := a.regQuota.Release(reserveID); releaseErr != nil {
				return nil, "", registrationTransactionError("释放注册风控占位", releaseErr, nil)
			}
		}
		return nil, "", err
	}

	if a.regQuota != nil {
		if err := a.regQuota.Bind(reserveID, identity.ID, email); err != nil {
			rollbackErr := errors.Join(a.regQuota.Release(reserveID), deleteRegisteredUser(a.auth, identity.ID))
			return nil, "", registrationTransactionError("保存注册风控账本", err, rollbackErr)
		}
	}
	if err := a.email.MarkCodeUsed(verificationID); err != nil {
		rollbackErr := errors.Join(rollbackRegistrationRisk(a.regQuota, identity.ID), deleteRegisteredUser(a.auth, identity.ID))
		return nil, "", registrationTransactionError("核销邮箱验证码", err, rollbackErr)
	}
	return identity, token, nil
}

func registrationTransactionError(operation string, primary, rollback error) error {
	return &emailRegistrationFinalizeError{operation: operation, primary: primary, rollback: rollback}
}

func rollbackRegistrationRisk(quota *service.RegistrationQuotaService, userID string) error {
	if quota == nil {
		return nil
	}
	return quota.RollbackSuccess(userID)
}

func deleteRegisteredUser(auth *service.AuthService, userID string) error {
	deleted, err := auth.DeleteUser(userID)
	if err != nil {
		return err
	}
	if !deleted {
		return fmt.Errorf("回滚新注册账号时账号不存在")
	}
	return nil
}
