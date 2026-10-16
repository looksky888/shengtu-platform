package app

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (s *Server) ensureMailWatcherIdleWorkers(ctx context.Context, workers map[string]mailboxWatcherIdleWorker) {
	groups := s.mailWatcherIMAPGroups()
	seen := make(map[string]struct{}, len(groups))
	for _, group := range groups {
		seen[group.key] = struct{}{}
		if worker, ok := workers[group.key]; ok && worker.signature == group.signature {
			continue
		}
		if worker, ok := workers[group.key]; ok {
			worker.cancel()
		}
		if err := s.ensureMailWatcherIMAPBaseline(ctx, group); err != nil {
			if s.logger != nil {
				s.logger.Warn("mail watcher imap baseline failed", "owner", s.ownerName(group.ownerID), "mailboxes", len(group.mailboxes), "err", err)
			}
			continue
		}
		workerCtx, cancel := context.WithCancel(ctx)
		workers[group.key] = mailboxWatcherIdleWorker{cancel: cancel, signature: group.signature}
		go s.runMailWatcherIdleWorker(workerCtx, group)
	}
	for key, worker := range workers {
		if _, ok := seen[key]; ok {
			continue
		}
		worker.cancel()
		delete(workers, key)
	}
}

func (s *Server) ensureMailWatcherIMAPBaseline(ctx context.Context, group mailboxWatcherIMAPGroup) error {
	if imapUIDNumber(group.state.IMAPLastSyncUID) > 0 {
		return nil
	}
	latestFn := s.latestIMAPUID
	if latestFn == nil {
		latestFn = LatestICloudIMAPUID
	}
	uid, err := latestFn(ctx, group.state)
	if err != nil {
		return err
	}
	if strings.TrimSpace(uid) == "" {
		return nil
	}
	accountID := ""
	resolver := s.imapSessionResolverForOwner(group.ownerID)
	for _, mailbox := range group.mailboxes {
		session, state, ok := resolver.sessionForMailbox(mailbox)
		if !ok || imapStateKey(state) != imapStateKey(group.state) {
			continue
		}
		accountID = strings.TrimSpace(session.AccountID)
		break
	}
	if _, err := s.store.SetICloudIMAPSyncCursor(group.ownerID, accountID, imapStateKey(group.state), time.Now(), uid); err != nil {
		return err
	}
	return nil
}

func (s *Server) runMailWatcherIdleWorker(ctx context.Context, group mailboxWatcherIMAPGroup) {
	backoff := time.Second
	for ctx.Err() == nil {
		err := WatchICloudIMAPExists(ctx, group.state, func() {
			if ctx.Err() != nil {
				return
			}
			syncCtx, cancel := context.WithTimeout(ctx, mailWatcherSyncTimeout)
			_, syncErr := s.syncMailboxCodeBatchForOwnerWithLimit(syncCtx, group.ownerID, group.mailboxes, time.Time{}, "ChatGPT", s.mailWatcherFetchLimit)
			cancel()
			if syncErr != nil && ctx.Err() == nil && s.logger != nil {
				s.logger.Warn("mail watcher idle sync failed", "owner", s.ownerName(group.ownerID), "mailboxes", len(group.mailboxes), "err", syncErr)
			}
		})
		if ctx.Err() != nil {
			return
		}
		if err != nil && s.logger != nil {
			s.logger.Warn("mail watcher idle disconnected", "owner", s.ownerName(group.ownerID), "mailboxes", len(group.mailboxes), "err", err)
		}
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		if backoff < 15*time.Second {
			backoff *= 2
		}
	}
}

func (s *Server) syncMailWatcherRound(ctx context.Context, initial bool) {
	if ctx.Err() != nil {
		return
	}
	groups := s.mailWatcherGroups()
	if len(groups) == 0 {
		return
	}
	after := time.Time{}
	fetchLimit := s.mailWatcherFetchLimit
	if initial {
		fetchLimit = s.mailWatcherInitialFetchLimit
		if s.mailWatcherLookback > 0 {
			after = time.Now().Add(-s.mailWatcherLookback)
		}
	}
	if fetchLimit <= 0 {
		fetchLimit = defaultMailWatcherFetchLimit
	}
	for _, group := range groups {
		if ctx.Err() != nil {
			return
		}
		syncCtx, cancel := context.WithTimeout(ctx, mailWatcherSyncTimeout)
		_, err := s.syncMailboxCodeBatchForOwnerWithLimit(syncCtx, group.ownerID, group.mailboxes, after, "OpenAI", fetchLimit)
		cancel()
		if err != nil && ctx.Err() == nil && s.logger != nil {
			s.logger.Warn("mail watcher sync failed", "owner", s.ownerName(group.ownerID), "mailboxes", len(group.mailboxes), "initial", initial, "err", err)
		}
	}
}

func (s *Server) markMailWatcherActive(mailboxID string) {
	mailboxID = strings.TrimSpace(mailboxID)
	if mailboxID == "" {
		return
	}
	ttl := mailWatcherActiveTTL
	if ttl <= 0 {
		ttl = 20 * time.Minute
	}
	s.mailWatcherMu.Lock()
	if s.mailWatcherActiveUntil == nil {
		s.mailWatcherActiveUntil = make(map[string]time.Time)
	}
	s.mailWatcherActiveUntil[mailboxID] = time.Now().Add(ttl)
	s.mailWatcherMu.Unlock()
	s.pokeMailWatcher()
}

func (s *Server) pokeMailWatcher() {
	if s == nil || !s.mailWatcherEnabled || s.mailWatcherWake == nil {
		return
	}
	select {
	case s.mailWatcherWake <- struct{}{}:
	default:
	}
}

func (s *Server) activeMailWatcherMailboxIDs(now time.Time) map[string]struct{} {
	if now.IsZero() {
		now = time.Now()
	}
	s.mailWatcherMu.Lock()
	defer s.mailWatcherMu.Unlock()
	active := make(map[string]struct{})
	for id, until := range s.mailWatcherActiveUntil {
		if until.After(now) {
			active[id] = struct{}{}
			continue
		}
		delete(s.mailWatcherActiveUntil, id)
	}
	return active
}

func (s *Server) mailWatcherGroups() []mailboxWatcherOwnerGroup {
	state := s.store.Snapshot()
	activeIDs := s.activeMailWatcherMailboxIDs(time.Now())
	byOwner := make(map[string][]Mailbox)
	for _, mailbox := range state.Mailboxes {
		if !mailbox.APIActive || !mailbox.ICloudActive || mailbox.Status == StatusDisabled {
			continue
		}
		ownerID := strings.TrimSpace(mailbox.OwnerID)
		if _, ok := s.imapStateForMailbox(ownerID, mailbox); !ok {
			continue
		}
		byOwner[ownerID] = append(byOwner[ownerID], mailbox)
	}
	owners := make([]string, 0, len(byOwner))
	for ownerID := range byOwner {
		owners = append(owners, ownerID)
	}
	sort.Strings(owners)
	groups := make([]mailboxWatcherOwnerGroup, 0, len(owners))
	for _, ownerID := range owners {
		mailboxes := byOwner[ownerID]
		sort.Slice(mailboxes, func(i, j int) bool {
			_, iActive := activeIDs[mailboxes[i].ID]
			_, jActive := activeIDs[mailboxes[j].ID]
			if iActive != jActive {
				return iActive
			}
			return mailboxes[i].Email < mailboxes[j].Email
		})
		groups = append(groups, mailboxWatcherOwnerGroup{ownerID: ownerID, mailboxes: mailboxes})
	}
	return groups
}

func (s *Server) mailWatcherIMAPGroups() []mailboxWatcherIMAPGroup {
	state := s.store.Snapshot()
	type bucket struct {
		ownerID   string
		state     LoginState
		mailboxes []Mailbox
	}
	buckets := make(map[string]*bucket)
	for _, mailbox := range state.Mailboxes {
		if !mailbox.APIActive || !mailbox.ICloudActive || mailbox.Status == StatusDisabled {
			continue
		}
		ownerID := strings.TrimSpace(mailbox.OwnerID)
		imapState, ok := s.imapStateForMailbox(ownerID, mailbox)
		if !ok {
			continue
		}
		key := ownerID + "|" + imapStateKey(imapState)
		item := buckets[key]
		if item == nil {
			item = &bucket{ownerID: ownerID, state: imapState}
			buckets[key] = item
		}
		item.mailboxes = append(item.mailboxes, mailbox)
	}
	keys := make([]string, 0, len(buckets))
	for key := range buckets {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	groups := make([]mailboxWatcherIMAPGroup, 0, len(keys))
	for _, key := range keys {
		item := buckets[key]
		sort.Slice(item.mailboxes, func(i, j int) bool {
			return item.mailboxes[i].Email < item.mailboxes[j].Email
		})
		groups = append(groups, mailboxWatcherIMAPGroup{
			key:       key,
			ownerID:   item.ownerID,
			state:     item.state,
			mailboxes: item.mailboxes,
			signature: mailWatcherIMAPGroupSignature(item.state, item.mailboxes),
		})
	}
	return groups
}

func mailWatcherIMAPGroupSignature(state LoginState, mailboxes []Mailbox) string {
	parts := []string{
		normalizeICloudIMAPEmail(state.IMAPEmail),
		strings.TrimSpace(state.IMAPUsername),
		state.IMAPHost,
		strconv.Itoa(state.IMAPPort),
	}
	for _, mailbox := range mailboxes {
		parts = append(parts, strings.TrimSpace(mailbox.ID), normalizeICloudIMAPEmail(mailbox.Email))
	}
	return strings.Join(parts, "|")
}
