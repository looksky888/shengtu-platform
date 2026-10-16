package httpapi

import (
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
	"net/http"
	"strings"
	"time"
)

func (a *App) logCall(identity service.Identity, summary, method, endpoint, model string, started time.Time, outcome string, status int, errText string, urls []string) {
	method = strings.ToUpper(strings.TrimSpace(method))
	if status <= 0 {
		status = http.StatusOK
		if outcome == "failed" {
			status = http.StatusInternalServerError
		}
	}
	ended := time.Now()
	detail := map[string]any{
		"method":         method,
		"path":           endpoint,
		"endpoint":       endpoint,
		"module":         inferAuditModule(endpoint),
		"model":          model,
		"started_at":     started.Format("2006-01-02 15:04:05"),
		"ended_at":       ended.Format("2006-01-02 15:04:05"),
		"duration_ms":    ended.Sub(started).Milliseconds(),
		"status":         status,
		"outcome":        outcome,
		"operation_type": operationTypeForMethod(method),
		"log_level":      logLevelForStatus(status),
	}
	addIdentityLogDetail(detail, identity)
	if name := identityDisplayName(identity); name != "" {
		detail["username"] = name
	}
	if errText != "" {
		detail["error"] = errText
	}
	if len(urls) > 0 {
		detail["urls"] = dedupe(urls)
	}
	suffix := "调用完成"
	if outcome == "failed" {
		suffix = "调用失败"
	}
	a.logs.Add(summary+suffix, detail)
}

func addIdentityLogDetail(detail map[string]any, identity service.Identity) {
	if name := util.Clean(firstNonEmpty(identity.CredentialName, identity.Name)); name != "" {
		detail["key_name"] = name
	}
	if role := util.Clean(identity.Role); role != "" {
		detail["key_role"] = role
	}
	if id := util.Clean(firstNonEmpty(identity.CredentialID, identity.ID)); id != "" {
		detail["key_id"] = id
	}
	if id := util.Clean(identity.ID); id != "" && id != util.Clean(identity.CredentialID) {
		detail["subject_id"] = id
	}
	if provider := util.Clean(identity.Provider); provider != "" {
		detail["provider"] = provider
	}
}

// logAdminUserDeleted writes a dedicated accountability event for managed-user deletes.
// Optional query context from cleanup UX: cleanup, inactive_days_min, credit_max, reason.
func (a *App) logAdminUserDeleted(r *http.Request, actor service.Identity, target service.ManagedUserPublic, userID string, creditBalance int) {
	if a == nil || a.logs == nil {
		return
	}
	userID = util.Clean(userID)
	if userID == "" {
		return
	}
	detail := map[string]any{
		"method":                 http.MethodDelete,
		"path":                   r.URL.Path,
		"module":                 "users",
		"status":                 http.StatusOK,
		"ip_address":             clientIP(r),
		"user_agent":             r.UserAgent(),
		"operation_type":         "删除用户",
		"log_level":              "warning",
		"deleted_user_id":        userID,
		"deleted_username":       util.Clean(target.Username),
		"deleted_name":           util.Clean(target.Name),
		"deleted_provider":       util.Clean(target.Provider),
		"deleted_role_id":        util.Clean(target.RoleID),
		"deleted_role_name":      util.Clean(target.RoleName),
		"deleted_credit_balance": creditBalance,
		"deleted_inactive_days":  target.InactiveDays,
		"cleanup_context":        false,
	}
	if r != nil && r.URL != nil {
		q := r.URL.Query()
		if cleanup := strings.TrimSpace(q.Get("cleanup")); cleanup != "" {
			detail["cleanup"] = cleanup
			detail["cleanup_context"] = true
		}
		if v := util.ToInt(q.Get("inactive_days_min"), 0); v > 0 {
			detail["inactive_days_min"] = v
			detail["cleanup_context"] = true
		}
		if raw := strings.TrimSpace(q.Get("credit_max")); raw != "" {
			detail["credit_max"] = util.ToInt(raw, 0)
			detail["cleanup_context"] = true
		}
		if reason := strings.TrimSpace(q.Get("reason")); reason != "" {
			// Cap free-text reason for log size / abuse.
			if len(reason) > 200 {
				reason = reason[:200]
			}
			detail["reason"] = reason
		}
	}
	addIdentityLogDetail(detail, actor)
	if name := identityDisplayName(actor); name != "" {
		detail["username"] = name
	} else {
		detail["username"] = "admin"
	}
	if err := a.logs.Add("管理端删除用户", detail); err != nil && a.logger != nil {
		a.logger.Error("admin user delete audit failed", "error", err, "deleted_user_id", userID)
	}
}
