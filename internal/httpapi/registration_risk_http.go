package httpapi

import (
	"errors"
	"math"
	"net/http"
	"strconv"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) writeRegistrationRiskError(w http.ResponseWriter, err error, clientIP string) {
	var riskErr *service.RegistrationRiskError
	if !errors.As(err, &riskErr) {
		if a.logger != nil {
			a.logger.Error("registration risk state failed", "error", err.Error())
		}
		util.WriteError(w, http.StatusServiceUnavailable, "注册风控暂时不可用，请稍后再试")
		return
	}
	if riskErr.RetryAfter > 0 {
		seconds := int64(math.Ceil(riskErr.RetryAfter.Seconds()))
		w.Header().Set("Retry-After", strconv.FormatInt(seconds, 10))
	}
	if a.logger != nil {
		a.logger.Warning("registration blocked", "code", riskErr.Code, "client_ip", clientIP)
	}
	util.WriteError(w, http.StatusTooManyRequests, riskErr.Message)
}
