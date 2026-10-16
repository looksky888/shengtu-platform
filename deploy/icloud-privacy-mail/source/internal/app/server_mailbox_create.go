package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

func (s *Server) createICloudMailboxForOwner(ctx context.Context, ownerID, accountID, label, note string) (Mailbox, ICloudRemoteMailbox, error) {
	session, ok := s.sessionForOwnerAccount(ownerID, accountID)
	if !ok {
		return Mailbox{}, ICloudRemoteMailbox{}, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先保存登录态", true)
	}
	accountID = firstNonEmpty(strings.TrimSpace(accountID), session.AccountID)
	remote, err := s.createICloudMailboxRemoteWithChannel(ctx, ownerID, session, label, note, mailboxCreateChannelFromContext(ctx))
	if err != nil {
		return Mailbox{}, ICloudRemoteMailbox{}, err
	}
	storeNote := strings.TrimSpace(remote.Note)
	if storeNote == "" {
		storeNote = "created by iCloud protocol"
	}
	mailbox, err := s.store.AddMailboxForOwner(ownerID, accountID, remote.Label, remote.Email)
	if err != nil {
		return Mailbox{}, remote, err
	}
	if storeNote != "" {
		updated, updateErr := s.store.SetMailboxStatus(mailbox.ID, nil, nil, StatusAvailable, storeNote)
		if updateErr == nil {
			mailbox = updated
		}
	}
	return mailbox, remote, nil
}

func (s *Server) createMailboxesForOwner(ctx context.Context, ownerID string, accountIDs []string, label, note string) ([]Mailbox, []ICloudRemoteMailbox, []createMailboxFailure, error) {
	accountIDs = normalizeAccountIDSelection("", accountIDs)
	requests := make([]mailboxCreateRequest, 0, len(accountIDs))
	for _, accountID := range accountIDs {
		requests = append(requests, mailboxCreateRequest{AccountID: accountID})
	}
	return s.createMailboxesForOwnerWithChannels(ctx, ownerID, requests, label, note)
}

func (s *Server) createMailboxesForOwnerWithChannels(ctx context.Context, ownerID string, requests []mailboxCreateRequest, label, note string) ([]Mailbox, []ICloudRemoteMailbox, []createMailboxFailure, error) {
	accountIDs, channels := normalizeMailboxCreateRequests(requests)
	sessions := s.sessionsForOwnerAccounts(ownerID, accountIDs)
	if len(sessions) == 0 {
		return nil, nil, nil, errCode("icloud_session_missing", "未找到可用于创建的 iCloud 登录态，请检查参与账号 ID 或先保存登录态", true)
	}
	mailboxes := make([]Mailbox, 0, len(sessions))
	remotes := make([]ICloudRemoteMailbox, 0, len(sessions))
	failures := make([]createMailboxFailure, 0)
	var firstErr error
	type createResult struct {
		session   ICloudSession
		mailbox   Mailbox
		remote    ICloudRemoteMailbox
		err       error
		accountID string
		channel   mailboxCreateChannel
	}
	results := make([]createResult, len(sessions))
	var wg sync.WaitGroup
	for index, session := range sessions {
		index, session := index, session
		wg.Add(1)
		go func() {
			defer wg.Done()
			effectiveAccountID := session.AccountID
			channel := channels[strings.TrimSpace(effectiveAccountID)]
			createCtx := contextWithMailboxCreateChannel(ctx, channel)
			mailbox, remote, err := s.createMailboxForOwner(createCtx, ownerID, effectiveAccountID, label, note)
			results[index] = createResult{
				session:   session,
				mailbox:   mailbox,
				remote:    remote,
				err:       err,
				accountID: effectiveAccountID,
				channel:   channel,
			}
		}()
	}
	wg.Wait()
	for _, result := range results {
		if result.err != nil {
			if firstErr == nil {
				firstErr = result.err
			}
			var coded codedError
			if !errors.As(result.err, &coded) {
				coded = codedError{}
			}
			failures = append(failures, createMailboxFailure{
				AccountID: result.accountID,
				AppleID:   strings.TrimSpace(result.session.AppleID),
				Channel:   string(result.channel),
				Code:      strings.TrimSpace(coded.code),
				Error:     result.err.Error(),
			})
			continue
		}
		mailboxes = append(mailboxes, result.mailbox)
		remotes = append(remotes, result.remote)
	}
	if len(mailboxes) == 0 && firstErr != nil {
		return mailboxes, remotes, failures, firstErr
	}
	return mailboxes, remotes, failures, nil
}

func (s *Server) createICloudMailboxRemote(ctx context.Context, ownerID string, session ICloudSession, label, note string) (ICloudRemoteMailbox, error) {
	return s.createICloudMailboxRemoteWithChannel(ctx, ownerID, session, label, note, mailboxCreateChannelAuto)
}

func (s *Server) createICloudMailboxRemoteWithChannel(ctx context.Context, ownerID string, session ICloudSession, label, note string, channel mailboxCreateChannel) (ICloudRemoteMailbox, error) {
	key := mailboxCreateAccountKey(ownerID, session)

	release, err := s.acquireMailboxCreateGate(ctx, key)
	if err != nil {
		return ICloudRemoteMailbox{}, err
	}
	defer release()
	if err := s.waitMailboxCreateInterval(ctx, key); err != nil {
		return ICloudRemoteMailbox{}, err
	}

	switch normalizeMailboxCreateChannel(channel) {
	case mailboxCreateChannelAppleAccount:
		return s.createICloudMailboxRemoteAppleAccount(ctx, ownerID, session, label, note, key)
	case mailboxCreateChannelICloudWeb:
		return s.createICloudMailboxRemoteICloudWeb(ctx, session, label, note, key)
	}

	var appleAccountErr error
	if _, ok := appleAccountLoginState(session); ok {
		remote, err := s.createICloudMailboxRemoteAppleAccount(ctx, ownerID, session, label, note, key)
		if err == nil {
			return remote, nil
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return ICloudRemoteMailbox{}, err
		}
		appleAccountErr = err
		s.logger.Warn("Apple Account mailbox create failed; falling back to iCloud HME", "account_id", session.AccountID, "err", err)
	}
	remote, err := s.createICloudMailboxRemoteICloudWeb(ctx, session, label, note, key)
	if err != nil && appleAccountErr != nil {
		return ICloudRemoteMailbox{}, errCode("mailbox_create_all_channels_failed", "新接口失败："+appleAccountErr.Error()+"；旧接口失败："+err.Error(), true)
	}
	return remote, err
}

func mailboxCreateAccountKey(ownerID string, session ICloudSession) string {
	key := strings.TrimSpace(ownerID)
	if key == "" {
		key = "global"
	}
	key += ":" + firstNonEmpty(session.AccountID, session.DSID, session.AppleID, "default")
	return key
}

func mailboxCreateChannelCooldownKey(accountKey string, channel mailboxCreateChannel) string {
	key := strings.TrimSpace(accountKey)
	if key == "" {
		key = "global:default"
	}
	channel = normalizeMailboxCreateChannel(channel)
	if channel == mailboxCreateChannelAuto {
		channel = mailboxCreateChannelICloudWeb
	}
	return key + ":cooldown:" + string(channel)
}

func (s *Server) createICloudMailboxRemoteAppleAccount(ctx context.Context, ownerID string, session ICloudSession, label, note, key string) (ICloudRemoteMailbox, error) {
	if _, ok := appleAccountLoginState(session); !ok {
		return ICloudRemoteMailbox{}, errCode("apple_account_session_missing", "未保存新接口登录态，请先完成新接口登录", true)
	}
	cooldownKey := mailboxCreateChannelCooldownKey(key, mailboxCreateChannelAppleAccount)
	remote, updatedSession, err := NewICloudClient().CreatePrivacyMailboxWithAppleAccount(ctx, session, s.cfg.AppleAccountAPIKey, label, note)
	s.markMailboxCreateFinished(key)
	if isCodedError(err, "apple_account_hme_limit") {
		s.markMailboxCreateCooldown(cooldownKey, mailboxCreateLimitCooldown)
	}
	if _, ok := appleAccountLoginState(updatedSession); ok {
		if saveErr := s.store.SaveICloudSessionForOwner(ownerID, updatedSession); saveErr != nil {
			s.logger.Warn("failed to save updated Apple Account login state", "account_id", session.AccountID, "err", saveErr)
		}
	}
	return remote, err
}

func (s *Server) createICloudMailboxRemoteICloudWeb(ctx context.Context, session ICloudSession, label, note, key string) (ICloudRemoteMailbox, error) {
	if !iCloudWebLoginSaved(session) {
		return ICloudRemoteMailbox{}, errCode("icloud_session_missing", "未保存旧接口登录态，请先完成旧接口登录", true)
	}
	cooldownKey := mailboxCreateChannelCooldownKey(key, mailboxCreateChannelICloudWeb)
	if cooldownRemaining := s.mailboxCreateCooldownRemaining(cooldownKey); cooldownRemaining > 0 {
		remaining := int(cooldownRemaining.Round(time.Second).Seconds())
		if remaining < 1 {
			remaining = 1
		}
		return ICloudRemoteMailbox{}, errCode("icloud_hme_limit", fmt.Sprintf("iCloud 创建上限冷却中，请约 %d 秒后再试", remaining), true)
	}

	remote, err := NewICloudClient().CreatePrivacyMailbox(ctx, session, label, note)
	s.markMailboxCreateFinished(key)
	var coded codedError
	if errors.As(err, &coded) && coded.code == "icloud_hme_limit" {
		s.markMailboxCreateCooldown(cooldownKey, mailboxCreateLimitCooldown)
	}
	return remote, err
}

func normalizeMailboxCreateRequests(requests []mailboxCreateRequest) ([]string, map[string]mailboxCreateChannel) {
	accountIDs := make([]string, 0, len(requests))
	channels := make(map[string]mailboxCreateChannel, len(requests))
	for _, request := range requests {
		for _, accountID := range splitAccountIDTokens(request.AccountID) {
			if accountID == "" {
				continue
			}
			if _, ok := channels[accountID]; ok {
				continue
			}
			channels[accountID] = normalizeMailboxCreateChannel(request.Channel)
			accountIDs = append(accountIDs, accountID)
		}
	}
	return accountIDs, channels
}

func (s *Server) acquireMailboxCreateGate(ctx context.Context, key string) (func(), error) {
	s.icloudCreateMu.Lock()
	gate := s.icloudCreateGates[key]
	if gate == nil {
		gate = make(chan struct{}, 1)
		s.icloudCreateGates[key] = gate
	}
	s.icloudCreateMu.Unlock()

	select {
	case gate <- struct{}{}:
		return func() { <-gate }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *Server) waitMailboxCreateInterval(ctx context.Context, key string) error {
	interval := mailboxCreateMinInterval
	if interval <= 0 {
		return nil
	}
	s.icloudCreateMu.Lock()
	last := s.icloudCreateLast[key]
	s.icloudCreateMu.Unlock()
	if last.IsZero() {
		return nil
	}
	wait := interval - time.Since(last)
	if wait <= 0 {
		return nil
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Server) markMailboxCreateFinished(key string) {
	s.icloudCreateMu.Lock()
	if s.icloudCreateLast == nil {
		s.icloudCreateLast = make(map[string]time.Time)
	}
	s.icloudCreateLast[key] = time.Now()
	s.icloudCreateMu.Unlock()
}

func (s *Server) mailboxCreateCooldownRemaining(key string) time.Duration {
	now := time.Now()
	s.icloudCreateMu.Lock()
	defer s.icloudCreateMu.Unlock()
	cooldownUntil := s.icloudCreateCooldown[key]
	if cooldownUntil.IsZero() {
		return 0
	}
	if !cooldownUntil.After(now) {
		delete(s.icloudCreateCooldown, key)
		return 0
	}
	return cooldownUntil.Sub(now)
}

func (s *Server) markMailboxCreateCooldown(key string, duration time.Duration) {
	if duration <= 0 {
		return
	}
	s.icloudCreateMu.Lock()
	if s.icloudCreateCooldown == nil {
		s.icloudCreateCooldown = make(map[string]time.Time)
	}
	s.icloudCreateCooldown[key] = time.Now().Add(duration)
	s.icloudCreateMu.Unlock()
}

func (s *Server) logICloudCreateError(ownerID string, err error) {
	var coded codedError
	if errors.As(err, &coded) {
		s.logger.Warn("iCloud mailbox create failed", "owner", s.ownerName(ownerID), "code", coded.code, "retryable", coded.retryable)
		return
	}
	s.logger.Warn("iCloud mailbox create failed", "owner", s.ownerName(ownerID), "err", err)
}
