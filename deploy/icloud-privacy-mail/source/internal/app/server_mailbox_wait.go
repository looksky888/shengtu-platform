package app

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"
)

func (s *Server) mailboxCodeWaitDuration(r *http.Request) time.Duration {
	fallback := s.mailboxCodeFastWait
	if r == nil {
		return fallback
	}
	raw := strings.TrimSpace(r.URL.Query().Get("wait_ms"))
	if raw == "" {
		return fallback
	}
	fallbackMS := int(fallback / time.Millisecond)
	maxMS := int(mailboxCodeMaxClientWait / time.Millisecond)
	waitMS := parseBoundedPositiveInt(raw, fallbackMS, 1, maxMS)
	return time.Duration(waitMS) * time.Millisecond
}

func (s *Server) waitMailboxCode(ctx context.Context, mailbox Mailbox, after time.Time, keyword string, forceSync bool, skipMessageID string, waitDuration time.Duration) mailboxCodeResult {
	waitCtx := context.Background()
	var requestDone <-chan struct{}
	if ctx != nil {
		waitCtx = context.WithoutCancel(ctx)
		requestDone = ctx.Done()
	}
	waiter := &mailboxCodeWaiter{
		ctx:           waitCtx,
		mailboxID:     mailbox.ID,
		after:         after,
		keyword:       keyword,
		forceSync:     forceSync,
		skipMessageID: skipMessageID,
		result:        make(chan mailboxCodeResult, 1),
	}
	ownerKey := mailboxSyncOwnerKey(mailbox.OwnerID)
	s.mailboxCodeMu.Lock()
	if s.mailboxCodePollers == nil {
		s.mailboxCodePollers = make(map[string]*mailboxCodePoller)
	}
	poller := s.mailboxCodePollers[ownerKey]
	if poller == nil {
		poller = &mailboxCodePoller{ownerID: mailbox.OwnerID}
		s.mailboxCodePollers[ownerKey] = poller
		go s.runMailboxCodePoller(ownerKey, poller)
	}
	poller.waiters = append(poller.waiters, waiter)
	s.mailboxCodeMu.Unlock()

	var timeout <-chan time.Time
	var timer *time.Timer
	if waitDuration > 0 {
		timer = time.NewTimer(waitDuration)
		timeout = timer.C
		defer timer.Stop()
	}
	var localTick <-chan time.Time
	var localTicker *time.Ticker
	if waitDuration > 0 {
		interval := mailboxCodeLocalPollInterval
		if interval <= 0 {
			interval = 100 * time.Millisecond
		}
		if interval > waitDuration {
			interval = waitDuration
		}
		localTicker = time.NewTicker(interval)
		localTick = localTicker.C
		defer localTicker.Stop()
	}
	for {
		select {
		case result := <-waiter.result:
			return result
		case <-localTick:
			if msg, code, ok := s.latestMailboxCodeForWaiter(waiter); ok {
				return mailboxCodeResult{message: msg, code: code, ok: true}
			}
		case <-timeout:
			if msg, code, ok := s.latestMailboxCodeForWaiter(waiter); ok {
				return mailboxCodeResult{message: msg, code: code, ok: true}
			}
			return mailboxCodeResult{}
		case <-requestDone:
			return mailboxCodeResult{syncErr: ctx.Err()}
		}
	}
}

func (s *Server) runMailboxCodePoller(ownerKey string, poller *mailboxCodePoller) {
	for {
		if debounce := mailboxCodePollDebounce; debounce > 0 {
			time.Sleep(debounce)
		}
		s.mailboxCodeMu.Lock()
		waiters := poller.waiters
		poller.waiters = nil
		if len(waiters) == 0 {
			delete(s.mailboxCodePollers, ownerKey)
			s.mailboxCodeMu.Unlock()
			return
		}
		s.mailboxCodeMu.Unlock()
		s.resolveMailboxCodeWaiters(poller.ownerID, waiters)
	}
}

func (s *Server) resolveMailboxCodeWaiters(ownerID string, waiters []*mailboxCodeWaiter) {
	active := activeMailboxCodeWaiters(waiters)
	if len(active) == 0 {
		return
	}
	pending := make([]*mailboxCodeWaiter, 0, len(active))
	for _, waiter := range active {
		if !waiter.forceSync {
			msg, code, ok := s.latestMailboxCodeForWaiter(waiter)
			if ok {
				deliverMailboxCodeResult(waiter, mailboxCodeResult{message: msg, code: code, ok: true})
				continue
			}
		}
		pending = append(pending, waiter)
	}
	if len(pending) == 0 {
		return
	}
	syncCtx := context.Background()
	if pending[0].ctx != nil {
		syncCtx = context.WithoutCancel(pending[0].ctx)
	}
	syncCtx, cancel := context.WithTimeout(syncCtx, mailboxCodeBatchSyncTimeout)
	defer cancel()
	syncErr := s.syncMailboxesForCodeWaiters(syncCtx, ownerID, pending)
	for _, waiter := range pending {
		if waiterCanceled(waiter) {
			continue
		}
		msg, code, ok := s.latestMailboxCodeForWaiter(waiter)
		deliverMailboxCodeResult(waiter, mailboxCodeResult{message: msg, code: code, ok: ok, syncErr: syncErr})
	}
}

func activeMailboxCodeWaiters(waiters []*mailboxCodeWaiter) []*mailboxCodeWaiter {
	active := make([]*mailboxCodeWaiter, 0, len(waiters))
	for _, waiter := range waiters {
		if waiter == nil || waiterCanceled(waiter) {
			continue
		}
		active = append(active, waiter)
	}
	return active
}

func waiterCanceled(waiter *mailboxCodeWaiter) bool {
	if waiter == nil || waiter.ctx == nil {
		return false
	}
	select {
	case <-waiter.ctx.Done():
		return true
	default:
		return false
	}
}

func deliverMailboxCodeResult(waiter *mailboxCodeWaiter, result mailboxCodeResult) {
	select {
	case waiter.result <- result:
	default:
	}
}

func (s *Server) latestMailboxCodeForWaiter(waiter *mailboxCodeWaiter) (Message, string, bool) {
	return latestMailboxCodeSkipping(s.store.MessagesForMailbox(waiter.mailboxID), waiter.after, waiter.keyword, time.Now(), waiter.skipMessageID)
}

func (s *Server) syncMailboxesForCodeWaiters(ctx context.Context, ownerID string, waiters []*mailboxCodeWaiter) error {
	type keywordGroup struct {
		keyword  string
		byID     map[string]Mailbox
		minAfter time.Time
	}
	groups := make(map[string]*keywordGroup)
	for _, waiter := range waiters {
		if waiterCanceled(waiter) {
			continue
		}
		mailbox, ok := s.store.FindMailboxByID(waiter.mailboxID)
		if !ok || !mailbox.APIActive || mailbox.Status == StatusDisabled || !mailbox.ICloudActive {
			continue
		}
		keyword := strings.TrimSpace(waiter.keyword)
		if keyword == "" {
			keyword = "OpenAI"
		}
		groupKey := strings.ToLower(keyword)
		group := groups[groupKey]
		if group == nil {
			group = &keywordGroup{keyword: keyword, byID: make(map[string]Mailbox)}
			groups[groupKey] = group
		}
		if group.minAfter.IsZero() || waiter.after.Before(group.minAfter) {
			group.minAfter = waiter.after
		}
		group.byID[waiter.mailboxID] = mailbox
	}
	if len(groups) == 0 {
		return nil
	}
	var firstErr error
	for _, group := range groups {
		mailboxes := make([]Mailbox, 0, len(group.byID))
		for _, mailbox := range group.byID {
			mailboxes = append(mailboxes, mailbox)
		}
		sort.Slice(mailboxes, func(i, j int) bool {
			return mailboxes[i].Email < mailboxes[j].Email
		})
		_, err := s.syncMailboxCodeBatchForOwnerWithLimit(ctx, ownerID, mailboxes, group.minAfter, group.keyword, 0)
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
