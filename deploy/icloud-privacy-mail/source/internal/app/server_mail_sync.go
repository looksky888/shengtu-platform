package app

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"
)

func (s *Server) syncMailbox(ctx context.Context, mailbox Mailbox, after time.Time, keyword string) (int, error) {
	return s.syncMailboxCodeBatchForOwnerWithLimit(ctx, mailbox.OwnerID, []Mailbox{mailbox}, after, keyword, mailboxSyncThreadLimit(mailbox))
}

func advanceIMAPUIDCursor(current, candidate string) string {
	currentNum := imapUIDNumber(current)
	candidateNum := imapUIDNumber(candidate)
	if candidateNum > currentNum {
		return strconv.Itoa(candidateNum)
	}
	if currentNum > 0 {
		return strconv.Itoa(currentNum)
	}
	return strings.TrimSpace(current)
}

func (s *Server) syncMailboxCodeBatchForOwnerWithLimit(ctx context.Context, ownerID string, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (int, error) {
	if len(mailboxes) == 0 {
		return 0, nil
	}
	refreshed := make([]Mailbox, 0, len(mailboxes))
	for _, mailbox := range mailboxes {
		latest, ok := s.store.FindMailboxByID(mailbox.ID)
		if !ok || !latest.APIActive || latest.Status == StatusDisabled || !latest.ICloudActive {
			continue
		}
		refreshed = append(refreshed, latest)
	}
	if len(refreshed) == 0 {
		return 0, nil
	}

	syncFn := s.syncCodeMailboxBatchWithCursor
	if syncFn == nil && s.syncCodeMailboxBatch != nil {
		syncFn = func(ctx context.Context, state LoginState, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (iCloudIMAPSyncResult, error) {
			messagesByMailbox, err := s.syncCodeMailboxBatch(ctx, state, mailboxes, after, keyword, maxMessages)
			return iCloudIMAPSyncResult{
				MessagesByMailbox: messagesByMailbox,
				LastUID:           highestICloudMessageUID(messagesByMailbox),
			}, err
		}
	}
	if syncFn == nil {
		syncFn = SyncICloudIMAPMessagesWithCursor
	}
	type imapGroup struct {
		key       string
		session   ICloudSession
		state     LoginState
		mailboxes []Mailbox
	}
	groups := make(map[string]*imapGroup)
	order := make([]string, 0)
	resolver := s.imapSessionResolverForOwner(ownerID)
	for _, mailbox := range refreshed {
		session, state, ok := resolver.sessionForMailbox(mailbox)
		if !ok {
			continue
		}
		key := imapStateKey(state)
		if key == "" {
			key = firstNonEmpty(strings.TrimSpace(session.AccountID), "__imap__")
		}
		group := groups[key]
		if group == nil {
			group = &imapGroup{key: key, session: session, state: state}
			groups[key] = group
			order = append(order, key)
		}
		group.mailboxes = append(group.mailboxes, mailbox)
	}
	if len(order) == 0 {
		return 0, errCode("imap_session_missing", "未保存取码登录，请先保存 iCloud 邮箱账号和 App 专用密码", true)
	}

	runGroup := func(group *imapGroup) (int, error) {
		syncScopeKey := mailboxSyncOwnerKey(ownerID) + "|imap|" + group.key
		release, err := s.acquireMailboxSyncSlot(ctx, syncScopeKey)
		if err != nil {
			return 0, err
		}
		defer release()

		if err := s.waitMailboxSyncInterval(ctx, syncScopeKey); err != nil {
			return 0, err
		}
		defer s.markMailboxSyncFinished(syncScopeKey)

		now := time.Now()
		syncResult, err := syncFn(ctx, group.state, group.mailboxes, after, keyword, maxMessages)
		if err != nil {
			return 0, err
		}
		messagesByMailbox := syncResult.MessagesByMailbox
		if messagesByMailbox == nil {
			messagesByMailbox = map[string][]ICloudSyncedMessage{}
		}
		lastAccountUID := advanceIMAPUIDCursor(
			group.state.IMAPLastSyncUID,
			firstNonEmpty(syncResult.LastUID, highestICloudMessageUID(messagesByMailbox)),
		)
		updates := make([]mailboxMessageSync, 0, len(group.mailboxes))
		for _, mailbox := range group.mailboxes {
			lastSyncUID := advanceIMAPUIDCursor(mailbox.LastSyncUID, lastAccountUID)
			latestMessageAt := mailbox.LastSyncAt
			messages := make([]syncedMessageInput, 0, len(messagesByMailbox[mailbox.ID]))
			for _, msg := range messagesByMailbox[mailbox.ID] {
				remoteID := strings.TrimSpace(msg.RemoteID)
				if remoteID == "" && strings.TrimSpace(msg.UID) != "" {
					remoteID = "imap:" + strings.TrimSpace(msg.UID)
				}
				candidateUID := firstNonEmpty(msg.UID, remoteID)
				lastSyncUID = advanceIMAPUIDCursor(lastSyncUID, candidateUID)
				if msg.ReceivedAt.After(latestMessageAt) {
					latestMessageAt = msg.ReceivedAt
				}
				if extractOTP(msg.Subject+"\n"+msg.Body) == "" {
					continue
				}
				messages = append(messages, syncedMessageInput{
					RemoteID: remoteID, Source: "imap", Subject: msg.Subject,
					From: msg.From, Body: msg.Body, ReceivedAt: msg.ReceivedAt,
				})
			}
			syncedAt := now
			if latestMessageAt.After(syncedAt) {
				syncedAt = latestMessageAt
			}
			updates = append(updates, mailboxMessageSync{
				MailboxID:    mailbox.ID,
				Messages:     messages,
				UpdateCursor: true,
				SyncedAt:     syncedAt,
				LastUID:      lastSyncUID,
			})
		}
		return s.store.applyMessageSync(updates, &iCloudIMAPSyncCursorUpdate{
			OwnerID: group.session.OwnerID, AccountID: group.session.AccountID, StateKey: imapStateKey(group.state),
			SyncedAt: now, LastUID: lastAccountUID,
		})
	}

	if len(order) == 1 {
		return runGroup(groups[order[0]])
	}

	type groupOutcome struct {
		created int
		err     error
		key     string
	}
	outcomes := make([]groupOutcome, len(order))
	var wg sync.WaitGroup
	for i, key := range order {
		wg.Add(1)
		go func(i int, group *imapGroup) {
			defer wg.Done()
			created, err := runGroup(group)
			outcomes[i] = groupOutcome{created: created, err: err, key: group.key}
		}(i, groups[key])
	}
	wg.Wait()

	synced := 0
	failed := 0
	errs := make([]error, 0)
	for _, out := range outcomes {
		synced += out.created
		if out.err != nil {
			failed++
			errs = append(errs, out.err)
			if s.logger != nil {
				s.logger.Warn("multi-account IMAP sync failed for account group", "imap_key", out.key, "err", out.err)
			}
		}
	}
	if failed == len(order) && len(errs) > 0 {
		return synced, errors.Join(errs...)
	}
	return synced, nil
}

func (s *Server) syncMailboxBatchForOwner(ctx context.Context, ownerID string, mailboxes []Mailbox, after time.Time, keyword string) error {
	return s.syncMailboxBatchForOwnerWithLimit(ctx, ownerID, mailboxes, after, keyword, 0)
}

func (s *Server) syncMailboxBatchForOwnerWithLimit(ctx context.Context, ownerID string, mailboxes []Mailbox, after time.Time, keyword string, maxThreadsOverride int) error {
	if len(mailboxes) == 0 {
		return nil
	}
	refreshed := make([]Mailbox, 0, len(mailboxes))
	for _, mailbox := range mailboxes {
		latest, ok := s.store.FindMailboxByID(mailbox.ID)
		if !ok {
			continue
		}
		refreshed = append(refreshed, latest)
	}
	if len(refreshed) == 0 {
		return nil
	}
	syncFn := s.syncMailboxBatch
	if syncFn == nil {
		syncFn = func(ctx context.Context, session ICloudSession, mailboxes []Mailbox, after time.Time, keyword string, maxThreads int) (map[string][]ICloudSyncedMessage, error) {
			return NewICloudClient().SyncMailboxMessagesBatch(ctx, session, mailboxes, after, keyword, maxThreads)
		}
	}
	type sessionGroup struct {
		key       string
		session   ICloudSession
		mailboxes []Mailbox
	}
	groups := make(map[string]*sessionGroup)
	order := make([]string, 0)
	for _, mailbox := range refreshed {
		session, ok := s.sessionForMailbox(ownerID, mailbox.AccountID)
		if !ok {
			continue
		}
		key := firstNonEmpty(session.AccountID, session.DSID, session.AppleID, "__legacy__")
		group := groups[key]
		if group == nil {
			group = &sessionGroup{key: key, session: session}
			groups[key] = group
			order = append(order, key)
		}
		group.mailboxes = append(group.mailboxes, mailbox)
	}
	if len(order) == 0 {
		return errCode("icloud_session_missing", "未保存 iCloud 登录态，请先保存旧接口登录态", true)
	}
	failed := 0
	errs := make([]error, 0)
	for _, key := range order {
		group := groups[key]
		syncScopeKey := mailboxSyncOwnerKey(ownerID) + "|web|" + group.key
		release, err := s.acquireMailboxSyncSlot(ctx, syncScopeKey)
		if err != nil {
			return err
		}
		if err := s.waitMailboxSyncInterval(ctx, syncScopeKey); err != nil {
			release()
			return err
		}
		maxThreads := mailboxBatchThreadLimit(group.mailboxes)
		if maxThreadsOverride > 0 {
			maxThreads = maxThreadsOverride
		}
		now := time.Now()
		messagesByMailbox, err := syncFn(ctx, group.session, group.mailboxes, after, keyword, maxThreads)
		s.markMailboxSyncFinished(syncScopeKey)
		release()
		if err != nil {
			if len(order) == 1 {
				return err
			}
			failed++
			errs = append(errs, err)
			if s.logger != nil {
				s.logger.Warn("multi-account web mail sync failed for account group", "account_key", group.key, "err", err)
			}
			continue
		}
		updates := make([]mailboxMessageSync, 0, len(group.mailboxes))
		for _, mailbox := range group.mailboxes {
			lastSyncUID := mailbox.LastSyncUID
			latestMessageAt := mailbox.LastSyncAt
			messages := make([]syncedMessageInput, 0, len(messagesByMailbox[mailbox.ID]))
			for _, msg := range messagesByMailbox[mailbox.ID] {
				if msg.ReceivedAt.After(latestMessageAt) {
					latestMessageAt = msg.ReceivedAt
					lastSyncUID = firstNonEmpty(msg.UID, msg.RemoteID)
				} else if strings.TrimSpace(lastSyncUID) == "" {
					lastSyncUID = firstNonEmpty(msg.UID, msg.RemoteID)
				}
				if extractOTP(msg.Subject+"\n"+msg.Body) == "" {
					continue
				}
				messages = append(messages, syncedMessageInput{
					RemoteID: msg.RemoteID, Source: "icloud", Subject: msg.Subject,
					From: msg.From, Body: msg.Body, ReceivedAt: msg.ReceivedAt,
				})
			}
			updates = append(updates, mailboxMessageSync{
				MailboxID: mailbox.ID, Messages: messages, UpdateCursor: true,
				SyncedAt: now, LastUID: lastSyncUID,
			})
		}
		if _, err := s.store.applyMessageSync(updates, nil); err != nil {
			return err
		}
	}
	if failed == len(order) && len(errs) > 0 {
		return errors.Join(errs...)
	}
	return nil
}

func highestICloudMessageUID(messagesByMailbox map[string][]ICloudSyncedMessage) string {
	highest := 0
	for _, messages := range messagesByMailbox {
		for _, msg := range messages {
			uid := imapUIDNumber(firstNonEmpty(msg.UID, msg.RemoteID))
			if uid > highest {
				highest = uid
			}
		}
	}
	if highest <= 0 {
		return ""
	}
	return strconv.Itoa(highest)
}

func icloudRemoteIDsFromMessages(messages []Message) []string {
	ids := make([]string, 0, len(messages))
	for _, msg := range messages {
		if extractOTP(msg.Subject+"\n"+msg.Body) == "" {
			continue
		}
		if strings.HasPrefix(strings.TrimSpace(msg.RemoteID), "icloud:") {
			ids = append(ids, msg.RemoteID)
		}
	}
	return uniqueStrings(ids)
}

func (s *Server) acquireMailboxSyncSlot(ctx context.Context, scopeKey string) (func(), error) {
	key := mailboxSyncOwnerKey(scopeKey)
	s.icloudMailSyncMu.Lock()
	if s.icloudMailSyncGates == nil {
		s.icloudMailSyncGates = make(map[string]chan struct{})
	}
	gate := s.icloudMailSyncGates[key]
	if gate == nil {
		gate = make(chan struct{}, 1)
		s.icloudMailSyncGates[key] = gate
	}
	s.icloudMailSyncMu.Unlock()

	select {
	case gate <- struct{}{}:
		return func() { <-gate }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *Server) waitMailboxSyncInterval(ctx context.Context, scopeKey string) error {
	interval := s.mailboxSyncMinInterval
	if interval <= 0 {
		return nil
	}
	key := mailboxSyncOwnerKey(scopeKey)
	s.icloudMailSyncMu.Lock()
	last := s.icloudMailSyncLast[key]
	s.icloudMailSyncMu.Unlock()
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

func (s *Server) markMailboxSyncFinished(scopeKey string) {
	key := mailboxSyncOwnerKey(scopeKey)
	s.icloudMailSyncMu.Lock()
	if s.icloudMailSyncLast == nil {
		s.icloudMailSyncLast = make(map[string]time.Time)
	}
	s.icloudMailSyncLast[key] = time.Now()
	s.icloudMailSyncMu.Unlock()
}

func mailboxSyncOwnerKey(ownerID string) string {
	key := strings.TrimSpace(ownerID)
	if key == "" {
		return "__legacy__"
	}
	return key
}

func mailboxSyncThreadLimit(mailbox Mailbox) int {
	if mailbox.LastSyncAt.IsZero() {
		return 20
	}
	return 10
}

func mailboxBatchThreadLimit(mailboxes []Mailbox) int {
	limit := 20
	for _, mailbox := range mailboxes {
		if mailbox.LastSyncAt.IsZero() {
			limit = 50
			break
		}
	}
	if len(mailboxes) >= 5 && limit < 50 {
		limit = 50
	}
	return limit
}
