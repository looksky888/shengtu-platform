package app

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
)

func (s *Server) handleCreateICloudMailbox(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID     string   `json:"account_id"`
		AccountIDs    []string `json:"account_ids"`
		Label         string   `json:"label"`
		Note          string   `json:"note"`
		CreateChannel string   `json:"create_channel"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	accountIDs := normalizeAccountIDSelection(payload.AccountID, payload.AccountIDs)
	if !s.canAccessAccountIDs(r, accountIDs) {
		writeError(w, http.StatusNotFound, errCode("account_not_found", "账号不存在", false))
		return
	}
	ownerID := requestOwnerID(r, s.store)
	channel := normalizeMailboxCreateChannel(mailboxCreateChannel(strings.ToLower(strings.TrimSpace(payload.CreateChannel))))
	requests := make([]mailboxCreateRequest, 0, len(accountIDs))
	for _, accountID := range accountIDs {
		requests = append(requests, mailboxCreateRequest{AccountID: accountID, Channel: channel})
	}
	mailboxes, remotes, failures, err := s.createMailboxesForOwnerWithChannels(r.Context(), ownerID, requests, payload.Label, payload.Note)
	if err != nil {
		s.logICloudCreateError(ownerID, err)
		if len(mailboxes) == 0 && len(failures) == 0 {
			writeError(w, http.StatusBadGateway, err)
			return
		}
	}
	out := make([]publicMailbox, 0, len(mailboxes))
	for _, mailbox := range mailboxes {
		out = append(out, s.publicMailbox(r, mailbox))
	}
	status := http.StatusCreated
	if len(failures) > 0 {
		status = http.StatusMultiStatus
	}
	remoteOut := make([]map[string]any, 0, len(remotes))
	for index, remote := range remotes {
		channel := mailboxCreateChannelFromRemote(remote)
		channelValue := string(channel)
		channelLabel := mailboxCreateChannelLabel(channel)
		if index < len(out) {
			out[index].CreateChannel = channelValue
			out[index].CreateChannelLabel = channelLabel
		}
		remoteOut = append(remoteOut, map[string]any{
			"anonymous_id":  remote.AnonymousID,
			"email":         remote.Email,
			"is_active":     remote.IsActive,
			"origin":        remote.Origin,
			"channel":       channelValue,
			"channel_label": channelLabel,
		})
	}
	firstMailbox := publicMailbox{}
	if len(out) > 0 {
		firstMailbox = out[0]
	}
	writeJSON(w, status, map[string]any{
		"success":   true,
		"remote":    firstMap(remoteOut),
		"remotes":   remoteOut,
		"mailbox":   firstMailbox,
		"mailboxes": out,
		"created":   len(out),
		"failures":  failures,
	})
}

func (s *Server) handleSyncICloudMailboxes(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID string `json:"account_id"`
	}
	if r.ContentLength != 0 {
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	} else {
		_ = r.Body.Close()
	}
	if !s.canAccessAccountID(r, payload.AccountID) {
		writeError(w, http.StatusNotFound, errCode("account_not_found", "账号不存在", false))
		return
	}
	ownerID := requestOwnerID(r, s.store)
	sessions := s.sessionsForOwner(ownerID, payload.AccountID)
	if len(sessions) == 0 {
		writeError(w, http.StatusBadRequest, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先保存旧接口登录态", true))
		return
	}

	created := 0
	updated := 0
	skipped := 0
	total := 0
	failed := 0
	out := make([]publicMailbox, 0)
	type syncJobResult struct {
		result syncICloudMailboxResult
		rows   []publicMailbox
		err    error
	}
	jobResults := make([]syncJobResult, len(sessions))
	var wg sync.WaitGroup
	for index, session := range sessions {
		wg.Add(1)
		go func(index int, session ICloudSession) {
			defer wg.Done()
			syncCtx, cancel := context.WithTimeout(r.Context(), iCloudMailboxListAccountTimeout)
			defer cancel()
			result, rows, err := s.syncICloudMailboxesForSession(syncCtx, r, ownerID, session)
			if err != nil && errors.Is(err, context.DeadlineExceeded) {
				err = errCode("icloud_sync_timeout", "该账号同步已有邮箱超时，请稍后单独重试", true)
				result.Error = err.Error()
			}
			jobResults[index] = syncJobResult{result: result, rows: rows, err: err}
		}(index, session)
	}
	wg.Wait()
	results := make([]syncICloudMailboxResult, 0, len(sessions))
	for _, job := range jobResults {
		result, rows, err := job.result, job.rows, job.err
		results = append(results, result)
		if err != nil {
			failed++
			s.logger.Warn("iCloud mailbox list failed", "account_id", result.AccountID, "err", err)
			continue
		}
		total += result.Total
		created += result.Created
		updated += result.Updated
		skipped += result.Skipped
		out = append(out, rows...)
	}
	message := ""
	if failed == len(sessions) {
		message = "全部 iCloud 账号同步失败，请看每个账号的失败原因"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"message":   message,
		"total":     total,
		"created":   created,
		"updated":   updated,
		"skipped":   skipped,
		"failed":    failed,
		"results":   results,
		"mailboxes": out,
	})
}

func (s *Server) syncICloudMailboxesForSession(ctx context.Context, r *http.Request, ownerID string, session ICloudSession) (syncICloudMailboxResult, []publicMailbox, error) {
	result := syncICloudMailboxResult{
		AccountID: session.AccountID,
		AppleID:   strings.TrimSpace(session.AppleID),
		Source:    string(mailboxCreateChannelICloudWeb),
	}
	if !iCloudWebLoginSaved(session) {
		err := errCode("icloud_session_missing", "该账号没有可用于同步已有邮箱的旧接口登录态，请先完成旧接口登录", true)
		result.Error = err.Error()
		return result, nil, err
	}
	remotes, err := NewICloudClient().ListPrivacyMailboxes(ctx, session)
	if err != nil {
		result.Error = err.Error()
		return result, nil, err
	}
	result.Total = len(remotes)
	out := make([]publicMailbox, 0, len(remotes))
	accountID := strings.TrimSpace(session.AccountID)
	for _, remote := range remotes {
		mailbox, isCreated, err := s.store.UpsertMailboxFromRemote(ownerID, accountID, remote, "synced from iCloud HME list")
		if err != nil {
			var coded codedError
			if errors.As(err, &coded) && coded.code == "mailbox_exists_other_owner" {
				result.Skipped++
				continue
			}
			result.Error = err.Error()
			return result, out, err
		}
		if isCreated {
			result.Created++
		} else {
			result.Updated++
		}
		out = append(out, s.publicMailbox(r, mailbox))
	}
	return result, out, nil
}
