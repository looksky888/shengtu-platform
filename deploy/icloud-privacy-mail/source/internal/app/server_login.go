package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

func checkSavedLoginStates(ctx context.Context, client *ICloudClient, session ICloudSession, checkedAt time.Time) (ICloudSession, bool, error) {
	return checkSavedLoginStatesWithIMAP(ctx, client, session, checkedAt, CheckICloudIMAPLogin)
}

func checkSavedLoginStatesWithIMAP(ctx context.Context, client *ICloudClient, session ICloudSession, checkedAt time.Time, imapChecker func(context.Context, string, string) error) (ICloudSession, bool, error) {
	var parts []string
	checks := 0
	successes := 0
	var lastErr error

	if appleAccountLoginSaved(session) {
		checks++
		updated, err := client.CheckAppleAccountManageSession(ctx, session)
		state, _ := appleAccountLoginState(session)
		if err != nil {
			lastErr = err
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = false
			state.LastStatusMessage = "新接口登录态异常：" + err.Error()
			session = withAppleAccountLoginState(session, state)
			parts = append(parts, "新接口异常")
		} else {
			session = updated
			state, _ = appleAccountLoginState(session)
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = true
			state.LastStatusMessage = "新接口登录态正常"
			session = withAppleAccountLoginState(session, state)
			successes++
			parts = append(parts, "新接口正常")
		}
	}

	if iCloudWebLoginSaved(session) {
		checks++
		state, _ := iCloudWebLoginState(session)
		// Retry once on transient network errors so a freshly saved login is not
		// immediately marked abnormal due to a single flaky mailws request.
		var err error
		for attempt := 0; attempt < 2; attempt++ {
			err = client.CheckMailSession(ctx, session)
			if err == nil {
				break
			}
			if attempt == 0 {
				select {
				case <-ctx.Done():
				case <-time.After(400 * time.Millisecond):
				}
			}
		}
		if err != nil {
			lastErr = err
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = false
			state.LastStatusMessage = "旧接口登录态异常：" + err.Error()
			session = withICloudWebLoginState(session, state)
			parts = append(parts, "旧接口异常")
		} else {
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = true
			state.LastStatusMessage = "旧接口登录态正常"
			session = withICloudWebLoginState(session, state)
			successes++
			parts = append(parts, "旧接口正常")
		}
	}

	if iCloudIMAPLoginSaved(session) {
		checks++
		state, _ := iCloudIMAPLoginState(session)
		if imapChecker == nil {
			imapChecker = CheckICloudIMAPLogin
		}
		if err := imapChecker(ctx, state.IMAPEmail, state.IMAPAppPassword); err != nil {
			lastErr = err
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = false
			state.LastStatusMessage = "取码登录异常：" + err.Error()
			session = withICloudIMAPLoginState(session, state)
			parts = append(parts, "取码登录异常")
		} else {
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = true
			state.LastStatusMessage = "取码登录正常"
			session = withICloudIMAPLoginState(session, state)
			successes++
			parts = append(parts, "取码登录正常")
		}
	}

	if checks == 0 {
		lastErr = errCode("icloud_session_missing", "未保存新接口、旧接口或取码登录态，请先保存登录态", true)
		parts = append(parts, lastErr.Error())
	}

	session.LastCheckedAt = checkedAt
	session.LastCheckOK = successes > 0
	switch {
	case successes == checks && checks > 0:
		session.LastStatusMessage = "登录态正常：" + strings.Join(parts, "；")
	case successes > 0:
		session.LastStatusMessage = "登录态部分正常：" + strings.Join(parts, "；")
	default:
		session.LastStatusMessage = "登录态异常：" + strings.Join(parts, "；")
	}
	if session.LastCheckOK {
		return session, true, nil
	}
	if lastErr == nil {
		lastErr = errors.New(session.LastStatusMessage)
	}
	return session, false, lastErr
}

func (s *Server) handleStartICloudProtocolLogin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AppleID         string `json:"apple_id"`
		Password        string `json:"password"`
		TwoFactorMethod string `json:"two_factor_method"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	result, err := NewAppleAuthClient().StartLogin(
		r.Context(),
		payload.AppleID,
		payload.Password,
		s.cfg.ICloudDefaultHost,
		s.cfg.ICloudClientID,
		s.icloudProtocolLogins,
		payload.TwoFactorMethod,
	)
	if err != nil {
		writeError(w, uiUpstreamErrorStatus(err), err)
		return
	}
	if result.Needs2FA {
		writeJSON(w, http.StatusOK, map[string]any{
			"success":    true,
			"needs_2fa":  true,
			"pending_id": result.PendingID,
			"apple_id":   result.AppleID,
			"expires_at": formatTime(result.ExpiresAt),
			"message":    result.Message,
		})
		return
	}
	if err := s.store.SaveICloudSessionForOwner(requestOwnerID(r, s.store), result.Session); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sessions := s.publicSessionsForRequest(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"needs_2fa": false,
		"message":   result.Message,
		"session":   publicSessionForAppleID(sessions, result.Session.AppleID),
		"sessions":  sessions,
	})
}

func (s *Server) handleSubmitICloudProtocol2FA(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		PendingID string `json:"pending_id"`
		Code      string `json:"code"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	pending, ok := s.icloudProtocolLogins.get(payload.PendingID)
	if !ok {
		writeError(w, http.StatusBadRequest, errCode("apple_login_pending_expired", "旧接口登录已过期，请重新输入账号密码发起登录", true))
		return
	}
	session, err := NewAppleAuthClient().Submit2FA(r.Context(), pending, payload.Code)
	if err != nil {
		writeError(w, uiUpstreamErrorStatus(err), err)
		return
	}
	s.icloudProtocolLogins.delete(payload.PendingID)
	if err := s.store.SaveICloudSessionForOwner(requestOwnerID(r, s.store), session); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sessions := s.publicSessionsForRequest(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "旧接口验证码登录成功，登录态已保存",
		"session":  publicSessionForAppleID(sessions, session.AppleID),
		"sessions": sessions,
	})
}

func (s *Server) handleStartAppleAccountLogin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AppleID         string `json:"apple_id"`
		Password        string `json:"password"`
		TwoFactorMethod string `json:"two_factor_method"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	result, err := NewAppleAuthClient().StartAppleAccountManageLogin(
		r.Context(),
		payload.AppleID,
		payload.Password,
		s.appleAccountLogins,
		payload.TwoFactorMethod,
	)
	if err != nil {
		writeError(w, uiUpstreamErrorStatus(err), err)
		return
	}
	if result.Needs2FA {
		writeJSON(w, http.StatusOK, map[string]any{
			"success":    true,
			"needs_2fa":  true,
			"pending_id": result.PendingID,
			"apple_id":   result.AppleID,
			"expires_at": formatTime(result.ExpiresAt),
			"message":    result.Message,
		})
		return
	}
	if err := s.store.SaveICloudSessionForOwner(requestOwnerID(r, s.store), result.Session); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sessions := s.publicSessionsForRequest(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"needs_2fa": false,
		"message":   result.Message,
		"session":   publicSessionForAppleID(sessions, result.Session.AppleID),
		"sessions":  sessions,
	})
}

func (s *Server) handleSubmitAppleAccount2FA(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		PendingID   string          `json:"pending_id"`
		Code        string          `json:"code"`
		PhoneNumber json.RawMessage `json:"phone_number,omitempty"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	pending, ok := s.appleAccountLogins.get(payload.PendingID)
	if !ok {
		writeError(w, http.StatusBadRequest, errCode("apple_login_pending_expired", "新接口登录已过期，请重新输入账号密码发起登录", true))
		return
	}
	session, err := NewAppleAuthClient().SubmitAppleAccountManage2FA(r.Context(), pending, payload.Code, payload.PhoneNumber)
	if err != nil {
		writeError(w, uiUpstreamErrorStatus(err), err)
		return
	}
	s.appleAccountLogins.delete(payload.PendingID)
	if err := s.store.SaveICloudSessionForOwner(requestOwnerID(r, s.store), session); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sessions := s.publicSessionsForRequest(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "新接口验证码登录成功，登录态已保存",
		"session":  publicSessionForAppleID(sessions, session.AppleID),
		"sessions": sessions,
	})
}
