package app

import (
	"strings"
)

func (s *Server) schedulerCreateChannelsByAccount(ownerID string, accountIDs []string, preferred mailboxCreateChannel) map[string][]mailboxCreateChannel {
	out := make(map[string][]mailboxCreateChannel)
	for _, session := range s.sessionsForOwnerAccounts(ownerID, accountIDs) {
		accountID := strings.TrimSpace(session.AccountID)
		if accountID == "" {
			continue
		}
		out[accountID] = schedulerCreateChannelsForSession(session, preferred)
	}
	return out
}

func schedulerCreateChannelsForSession(session ICloudSession, preferred mailboxCreateChannel) []mailboxCreateChannel {
	channels := make([]mailboxCreateChannel, 0, 2)
	preferred = normalizeMailboxCreateChannel(preferred)
	if preferred == mailboxCreateChannelAppleAccount {
		if _, ok := appleAccountLoginState(session); ok {
			return []mailboxCreateChannel{mailboxCreateChannelAppleAccount}
		}
		return nil
	}
	if preferred == mailboxCreateChannelICloudWeb {
		if iCloudWebLoginSaved(session) {
			return []mailboxCreateChannel{mailboxCreateChannelICloudWeb}
		}
		return nil
	}
	if _, ok := appleAccountLoginState(session); ok {
		channels = append(channels, mailboxCreateChannelAppleAccount)
	}
	if iCloudWebLoginSaved(session) {
		channels = append(channels, mailboxCreateChannelICloudWeb)
	}
	return channels
}

func activeSchedulerCreateRequests(accountIDs []string, channels map[string][]mailboxCreateChannel, disabled map[string]map[mailboxCreateChannel]bool, skipped map[string]bool, oneShotFallback map[string]mailboxCreateChannel, createdByChannel map[string]map[mailboxCreateChannel]int) []mailboxCreateRequest {
	out := make([]mailboxCreateRequest, 0, len(accountIDs))
	for _, accountID := range normalizeAccountIDSelection("", accountIDs) {
		accountID = strings.TrimSpace(accountID)
		if accountID == "" || skipped[accountID] {
			continue
		}
		channel, ok := oneShotSchedulerCreateChannel(oneShotFallback[accountID], disabled[accountID])
		if ok && schedulerCreateQuotaReached(createdByChannel, accountID, channel) {
			ok = false
		}
		if !ok {
			channel, ok = nextSchedulerCreateChannelWithQuota(channels[accountID], disabled[accountID], accountID, createdByChannel)
		}
		if !ok {
			continue
		}
		out = append(out, mailboxCreateRequest{AccountID: accountID, Channel: channel})
	}
	return out
}

func nextSchedulerCreateChannelWithQuota(channels []mailboxCreateChannel, disabled map[mailboxCreateChannel]bool, accountID string, createdByChannel map[string]map[mailboxCreateChannel]int) (mailboxCreateChannel, bool) {
	for _, channel := range channels {
		channel = normalizeMailboxCreateChannel(channel)
		if channel == mailboxCreateChannelAuto || (disabled != nil && disabled[channel]) || schedulerCreateQuotaReached(createdByChannel, accountID, channel) {
			continue
		}
		return channel, true
	}
	return mailboxCreateChannelAuto, false
}

func schedulerCreateQuotaReached(createdByChannel map[string]map[mailboxCreateChannel]int, accountID string, channel mailboxCreateChannel) bool {
	quota := mailboxSchedulerQuota(channel)
	if quota <= 0 {
		return false
	}
	return createdByChannel[accountID][normalizeMailboxCreateChannel(channel)] >= quota
}

func mailboxSchedulerQuota(channel mailboxCreateChannel) int {
	switch normalizeMailboxCreateChannel(channel) {
	case mailboxCreateChannelAppleAccount:
		return mailboxSchedulerAppleQuota
	case mailboxCreateChannelICloudWeb:
		return mailboxSchedulerICloudQuota
	default:
		return 0
	}
}

func schedulerAllAccountsReachedTarget(accountIDs []string, mailboxCounts map[string]int) bool {
	seen := false
	for _, accountID := range normalizeAccountIDSelection("", accountIDs) {
		seen = true
		if mailboxCounts[strings.TrimSpace(accountID)] < defaultMailboxSchedulerTarget {
			return false
		}
	}
	return seen
}

func (s *Server) schedulerMailboxCountsByAccount(ownerID string, accountIDs []string) map[string]int {
	counts := make(map[string]int)
	allowed := make(map[string]struct{})
	for _, accountID := range normalizeAccountIDSelection("", accountIDs) {
		allowed[strings.TrimSpace(accountID)] = struct{}{}
	}
	for _, mailbox := range s.store.SnapshotForOwner(strings.TrimSpace(ownerID)).Mailboxes {
		accountID := strings.TrimSpace(mailbox.AccountID)
		if accountID == "" {
			continue
		}
		if len(allowed) == 0 {
			counts[accountID]++
			continue
		}
		if _, ok := allowed[accountID]; ok {
			counts[accountID]++
		}
	}
	return counts
}

func oneShotSchedulerCreateChannel(channel mailboxCreateChannel, disabled map[mailboxCreateChannel]bool) (mailboxCreateChannel, bool) {
	channel = normalizeMailboxCreateChannel(channel)
	if channel == mailboxCreateChannelAuto {
		return mailboxCreateChannelAuto, false
	}
	if disabled != nil && disabled[channel] {
		return mailboxCreateChannelAuto, false
	}
	return channel, true
}

func nextSchedulerCreateChannel(channels []mailboxCreateChannel, disabled map[mailboxCreateChannel]bool) (mailboxCreateChannel, bool) {
	for _, channel := range channels {
		channel = normalizeMailboxCreateChannel(channel)
		if channel == mailboxCreateChannelAuto {
			continue
		}
		if disabled != nil && disabled[channel] {
			continue
		}
		return channel, true
	}
	return mailboxCreateChannelAuto, false
}

func nextSchedulerCreateChannelAfter(channels []mailboxCreateChannel, disabled map[mailboxCreateChannel]bool, after mailboxCreateChannel) (mailboxCreateChannel, bool) {
	after = normalizeMailboxCreateChannel(after)
	seen := after == mailboxCreateChannelAuto
	for _, channel := range channels {
		channel = normalizeMailboxCreateChannel(channel)
		if channel == mailboxCreateChannelAuto {
			continue
		}
		if !seen {
			seen = channel == after
			continue
		}
		if disabled != nil && disabled[channel] {
			continue
		}
		return channel, true
	}
	return mailboxCreateChannelAuto, false
}

func schedulerTransientCreateFailure(failure createMailboxFailure) bool {
	switch strings.TrimSpace(failure.Code) {
	case "apple_account_generate_empty", "apple_account_api_failed", "apple_account_bad_response":
		return normalizeMailboxCreateChannel(mailboxCreateChannel(failure.Channel)) == mailboxCreateChannelAppleAccount
	default:
		return false
	}
}

func schedulerTransientCreateRetried(retried map[string]map[mailboxCreateChannel]bool, accountID string, channel mailboxCreateChannel) bool {
	accountID = strings.TrimSpace(accountID)
	channel = normalizeMailboxCreateChannel(channel)
	if accountID == "" || channel == mailboxCreateChannelAuto {
		return false
	}
	return retried[accountID] != nil && retried[accountID][channel]
}

func markSchedulerTransientCreateRetried(retried map[string]map[mailboxCreateChannel]bool, accountID string, channel mailboxCreateChannel) {
	accountID = strings.TrimSpace(accountID)
	channel = normalizeMailboxCreateChannel(channel)
	if accountID == "" || channel == mailboxCreateChannelAuto {
		return
	}
	if retried[accountID] == nil {
		retried[accountID] = make(map[mailboxCreateChannel]bool)
	}
	retried[accountID][channel] = true
}

func disableSchedulerCreateChannel(disabled map[string]map[mailboxCreateChannel]bool, accountID string, channel mailboxCreateChannel) {
	channel = normalizeMailboxCreateChannel(channel)
	if accountID == "" || channel == mailboxCreateChannelAuto {
		return
	}
	if disabled[accountID] == nil {
		disabled[accountID] = make(map[mailboxCreateChannel]bool)
	}
	disabled[accountID][channel] = true
}

func activeRequestChannel(requests []mailboxCreateRequest, accountID string) mailboxCreateChannel {
	accountID = strings.TrimSpace(accountID)
	for _, request := range requests {
		if strings.TrimSpace(request.AccountID) == accountID {
			return normalizeMailboxCreateChannel(request.Channel)
		}
	}
	return mailboxCreateChannelAuto
}
