package app

import (
	"context"
	"strconv"
	"strings"
	"time"
)

func (s *Server) syncMailbox(ctx context.Context, mailbox Mailbox, after time.Time, keyword string) (int, error) {
	return s.syncMailboxCodeBatchForOwnerWithLimit(ctx, mailbox.OwnerID, []Mailbox{mailbox}, after, keyword, mailboxSyncThreadLimit(mailbox))
}

func (s *Server) syncMailboxCodeBatchForOwnerWithLimit(ctx context.Context, ownerID string, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (int, error) {
	if len(mailboxes) == 0 {
		return 0, nil
	}
	release, err := s.acquireMailboxSyncSlot(ctx, ownerID)
	if err != nil {
		return 0, err
	}
	defer release()

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
	if err := s.waitMailboxSyncInterval(ctx, ownerID); err != nil {
		return 0, err
	}
	defer s.markMailboxSyncFinished(ownerID)

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
			return 0, errCode("imap_session_missing", "未保存取码登录，请先保存 iCloud 邮箱账号和 App 专用密码", true)
		}
		key := firstNonEmpty(strings.TrimSpace(session.AccountID), "__imap__") + "|" + imapStateKey(state)
		group := groups[key]
		if group == nil {
			group = &imapGroup{session: session, state: state}
			groups[key] = group
			order = append(order, key)
		}
		group.mailboxes = append(group.mailboxes, mailbox)
	}
	now := time.Now()
	synced := 0
	for _, key := range order {
		group := groups[key]
		syncResult, err := syncFn(ctx, group.state, group.mailboxes, after, keyword, maxMessages)
		if err != nil {
			return synced, err
		}
		messagesByMailbox := syncResult.MessagesByMailbox
		if messagesByMailbox == nil {
			messagesByMailbox = map[string][]ICloudSyncedMessage{}
		}
		lastAccountUID := firstNonEmpty(syncResult.LastUID, highestICloudMessageUID(messagesByMailbox))
		updates := make([]mailboxMessageSync, 0, len(group.mailboxes))
		for _, mailbox := range group.mailboxes {
			lastSyncUID := mailbox.LastSyncUID
			latestMessageAt := mailbox.LastSyncAt
			messages := make([]syncedMessageInput, 0, len(messagesByMailbox[mailbox.ID]))
			for _, msg := range messagesByMailbox[mailbox.ID] {
				if extractOTP(msg.Subject+"\n"+msg.Body) == "" {
					continue
				}
				remoteID := strings.TrimSpace(msg.RemoteID)
				if remoteID == "" && strings.TrimSpace(msg.UID) != "" {
					remoteID = "imap:" + strings.TrimSpace(msg.UID)
				}
				messages = append(messages, syncedMessageInput{
					RemoteID: remoteID, Source: "imap", Subject: msg.Subject,
					From: msg.From, Body: msg.Body, ReceivedAt: msg.ReceivedAt,
				})
				candidateUID := firstNonEmpty(msg.UID, remoteID)
				if msg.ReceivedAt.After(latestMessageAt) {
					latestMessageAt = msg.ReceivedAt
					lastSyncUID = candidateUID
				} else if strings.TrimSpace(lastSyncUID) == "" && strings.TrimSpace(candidateUID) != "" {
					lastSyncUID = candidateUID
				}
			}
			if len(messages) > 0 {
				syncedAt := latestMessageAt
				if syncedAt.IsZero() {
					syncedAt = now
				}
				updates = append(updates, mailboxMessageSync{
					MailboxID: mailbox.ID, Messages: messages, UpdateCursor: true,
					SyncedAt: syncedAt, LastUID: lastSyncUID,
				})
			}
		}
		created, err := s.store.applyMessageSync(updates, &iCloudIMAPSyncCursorUpdate{
			OwnerID: ownerID, AccountID: group.session.AccountID, StateKey: imapStateKey(group.state),
			SyncedAt: now, LastUID: lastAccountUID,
		})
		if err != nil {
			return synced, err
		}
		synced += created
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
	release, err := s.acquireMailboxSyncSlot(ctx, ownerID)
	if err != nil {
		return err
	}
	defer release()

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
	if err := s.waitMailboxSyncInterval(ctx, ownerID); err != nil {
		return err
	}
	defer s.markMailboxSyncFinished(ownerID)
	syncFn := s.syncMailboxBatch
	if syncFn == nil {
		syncFn = func(ctx context.Context, session ICloudSession, mailboxes []Mailbox, after time.Time, keyword string, maxThreads int) (map[string][]ICloudSyncedMessage, error) {
			return NewICloudClient().SyncMailboxMessagesBatch(ctx, session, mailboxes, after, keyword, maxThreads)
		}
	}
	type sessionGroup struct {
		session   ICloudSession
		mailboxes []Mailbox
	}
	groups := make(map[string]*sessionGroup)
	order := make([]string, 0)
	for _, mailbox := range refreshed {
		session, ok := s.sessionForMailbox(ownerID, mailbox.AccountID)
		if !ok {
			return errCode("icloud_session_missing", "未保存 iCloud 登录态，请先保存旧接口登录态", true)
		}
		key := firstNonEmpty(session.AccountID, session.DSID, session.AppleID, "__legacy__")
		group := groups[key]
		if group == nil {
			group = &sessionGroup{session: session}
			groups[key] = group
			order = append(order, key)
		}
		group.mailboxes = append(group.mailboxes, mailbox)
	}
	now := time.Now()
	for _, key := range order {
		group := groups[key]
		maxThreads := mailboxBatchThreadLimit(group.mailboxes)
		if maxThreadsOverride > 0 {
			maxThreads = maxThreadsOverride
		}
		messagesByMailbox, err := syncFn(ctx, group.session, group.mailboxes, after, keyword, maxThreads)
		if err != nil {
			return err
		}
		updates := make([]mailboxMessageSync, 0, len(group.mailboxes))
		for _, mailbox := range group.mailboxes {
			lastSyncUID := mailbox.LastSyncUID
			latestMessageAt := mailbox.LastSyncAt
			messages := make([]syncedMessageInput, 0, len(messagesByMailbox[mailbox.ID]))
			for _, msg := range messagesByMailbox[mailbox.ID] {
				if extractOTP(msg.Subject+"\n"+msg.Body) == "" {
					continue
				}
				messages = append(messages, syncedMessageInput{
					RemoteID: msg.RemoteID, Source: "icloud", Subject: msg.Subject,
					From: msg.From, Body: msg.Body, ReceivedAt: msg.ReceivedAt,
				})
				if msg.ReceivedAt.After(latestMessageAt) {
					latestMessageAt = msg.ReceivedAt
					lastSyncUID = firstNonEmpty(msg.UID, msg.RemoteID)
				}
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

func (s *Server) acquireMailboxSyncSlot(ctx context.Context, ownerID string) (func(), error) {
	key := mailboxSyncOwnerKey(ownerID)
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

func (s *Server) waitMailboxSyncInterval(ctx context.Context, ownerID string) error {
	interval := s.mailboxSyncMinInterval
	if interval <= 0 {
		return nil
	}
	key := mailboxSyncOwnerKey(ownerID)
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

func (s *Server) markMailboxSyncFinished(ownerID string) {
	key := mailboxSyncOwnerKey(ownerID)
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
