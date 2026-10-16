package httpapi

import (
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/terms"
	"chatgpt2api/internal/util"
)

type AuthProvidersPublic struct {
	Registration  AuthProvidersRegistration  `json:"registration"`
	PasswordReset AuthProvidersPasswordReset `json:"password_reset"`
	Terms         AuthProvidersTerms         `json:"terms"`
}

type AuthProvidersPasswordReset struct {
	Enabled            bool `json:"enabled"`
	CodeLength         int  `json:"code_length"`
	ExpiresInSeconds   int  `json:"expires_in_seconds"`
	ResendAfterSeconds int  `json:"resend_after_seconds"`
}

type AuthProvidersRegistration struct {
	Enabled bool                          `json:"enabled"`
	Email   AuthProvidersEmail            `json:"email"`
	Risk    AuthProvidersRegistrationRisk `json:"risk"`
}

type AuthProvidersRegistrationRisk struct {
	Enabled                  bool `json:"enabled"`
	DeviceSuccessLimit       int  `json:"device_success_limit"`
	DeviceWindowDays         int  `json:"device_window_days"`
	IPSuccessLimit           int  `json:"ip_success_limit"`
	IPDistinctDeviceLimit    int  `json:"ip_distinct_device_limit"`
	IPWindowHours            int  `json:"ip_window_hours"`
	PairAttemptLimit         int  `json:"pair_attempt_limit"`
	PairAttemptWindowMinutes int  `json:"pair_attempt_window_minutes"`
	SubnetSuccessLimit       int  `json:"subnet_success_limit"`
	SubnetWindowHours        int  `json:"subnet_window_hours"`
}

type AuthProvidersEmail struct {
	Enabled            bool `json:"enabled"`
	Required           bool `json:"required"`
	CodeLength         int  `json:"code_length"`
	ExpiresInSeconds   int  `json:"expires_in_seconds"`
	ResendAfterSeconds int  `json:"resend_after_seconds"`
}

type AuthProvidersTerms struct {
	Version string `json:"version"`
	Title   string `json:"title"`
}

func (a *App) handleAuthProviders(w http.ResponseWriter, r *http.Request) {
	_ = a.ensureDeviceID(w, r)
	policy := service.DefaultRegistrationRiskPolicy()
	if a.regQuota != nil {
		policy = a.regQuota.Policy()
	}
	registration := AuthProvidersRegistration{
		Enabled: a.config.RegistrationEnabled(),
		Email: AuthProvidersEmail{
			Enabled: a.email != nil && a.email.Enabled(), Required: true,
			CodeLength: 6, ExpiresInSeconds: 600, ResendAfterSeconds: 60,
		},
		Risk: publicRegistrationRisk(policy),
	}
	util.WriteJSON(w, http.StatusOK, AuthProvidersPublic{
		Registration: registration,
		PasswordReset: AuthProvidersPasswordReset{
			Enabled:    a.email != nil && a.email.Enabled(),
			CodeLength: 6, ExpiresInSeconds: 600, ResendAfterSeconds: 60,
		},
		Terms: AuthProvidersTerms{Version: terms.Version, Title: terms.Title},
	})
}

func publicRegistrationRisk(policy service.RegistrationRiskPolicy) AuthProvidersRegistrationRisk {
	return AuthProvidersRegistrationRisk{
		Enabled:            policy.Enabled,
		DeviceSuccessLimit: policy.DeviceSuccessLimit, DeviceWindowDays: policy.DeviceWindowDays,
		IPSuccessLimit: policy.IPSuccessLimit, IPDistinctDeviceLimit: policy.IPDistinctDeviceLimit,
		IPWindowHours:    policy.IPWindowHours,
		PairAttemptLimit: policy.PairAttemptLimit, PairAttemptWindowMinutes: policy.PairAttemptWindowMinutes,
		SubnetSuccessLimit: policy.SubnetSuccessLimit, SubnetWindowHours: policy.SubnetWindowHours,
	}
}
