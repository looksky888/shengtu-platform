package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

func (s *Server) runMailboxSchedulerBatch(ctx context.Context, ownerID string, job *mailboxSchedulerJob, cfg mailboxSchedulerConfig, batch int) bool {
	batchAccountIDs := normalizeAccountIDSelection("", cfg.AccountIDs)
	if len(batchAccountIDs) == 0 {
		for _, session := range s.sessionsForOwnerAccounts(ownerID, cfg.AccountIDs) {
			if accountID := strings.TrimSpace(session.AccountID); accountID != "" {
				batchAccountIDs = append(batchAccountIDs, accountID)
			}
		}
	}
	accountChannels := s.schedulerCreateChannelsByAccount(ownerID, batchAccountIDs, cfg.CreateChannel)
	disabledChannels := make(map[string]map[mailboxCreateChannel]bool)
	createdByChannel := make(map[string]map[mailboxCreateChannel]int)
	mailboxCounts := s.schedulerMailboxCountsByAccount(ownerID, batchAccountIDs)
	oneShotNextChannels := make(map[string]mailboxCreateChannel)
	transientRetriedChannels := make(map[string]map[mailboxCreateChannel]bool)
	skippedThisBatch := make(map[string]bool)
	for _, accountID := range batchAccountIDs {
		accountID = strings.TrimSpace(accountID)
		if mailboxCounts[accountID] >= defaultMailboxSchedulerTarget {
			skippedThisBatch[accountID] = true
			job.mu.Lock()
			job.addEventLocked("target_reached", fmt.Sprintf("%s 已达到每账号 %d 个邮箱目标", s.schedulerMailboxAccountLabel(accountID), defaultMailboxSchedulerTarget), batch, Mailbox{}, nil)
			job.mu.Unlock()
			continue
		}
		if accountID == "" || len(accountChannels[accountID]) > 0 {
			continue
		}
		skippedThisBatch[accountID] = true
		message := schedulerMissingLoginStateMessage(cfg.CreateChannel)
		job.mu.Lock()
		job.state.Failed++
		job.state.LastError = message
		job.addEventLocked("failed", schedulerAccountFailedMessage(0, "", mailboxCreateChannelAuto, message), batch, Mailbox{}, errors.New(message))
		job.mu.Unlock()
	}
	for index := 1; ; index++ {
		if ctx.Err() != nil {
			return false
		}
		activeRequests := activeSchedulerCreateRequests(batchAccountIDs, accountChannels, disabledChannels, skippedThisBatch, oneShotNextChannels, createdByChannel)
		if len(activeRequests) == 0 {
			job.mu.Lock()
			completed := schedulerAllAccountsReachedTarget(batchAccountIDs, mailboxCounts)
			if completed {
				job.addEventLocked("target_reached", fmt.Sprintf("第 %d 次定时创建完成：所有账号已达到每账号 %d 个邮箱的目标", batch, defaultMailboxSchedulerTarget), batch, Mailbox{}, nil)
			} else {
				job.addEventLocked("skipped", fmt.Sprintf("第 %d 次定时创建剩余账号都已临时跳过，下一次定时创建会重新尝试", batch), batch, Mailbox{}, nil)
			}
			job.mu.Unlock()
			return completed
		}
		label := schedulerMailboxLabel(cfg.Label, batch, index, 0)
		mailboxes, remotes, failures, err := s.createMailboxesForOwnerWithChannels(ctx, ownerID, activeRequests, label, cfg.Note)
		if err != nil && len(mailboxes) == 0 && len(failures) == 0 {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return false
			}
			s.logICloudCreateError(ownerID, err)
			message := schedulerErrorMessage(err)
			job.mu.Lock()
			job.state.Failed++
			job.state.LastError = message
			job.addEventLocked("failed", schedulerBatchFailedMessage(index, message), batch, Mailbox{}, err)
			job.mu.Unlock()
			return false
		}
		job.mu.Lock()
		job.state.Success += len(mailboxes)
		job.state.LastError = ""
		for mailboxIndex, mailbox := range mailboxes {
			channel := mailboxCreateChannelAuto
			if mailboxIndex < len(remotes) {
				channel = mailboxCreateChannelFromRemote(remotes[mailboxIndex])
			}
			if accountID := strings.TrimSpace(mailbox.AccountID); accountID != "" {
				mailboxCounts[accountID]++
				if channel == mailboxCreateChannelAuto {
					channel = activeRequestChannel(activeRequests, accountID)
				}
				if channel != mailboxCreateChannelAuto {
					if createdByChannel[accountID] == nil {
						createdByChannel[accountID] = make(map[mailboxCreateChannel]int)
					}
					createdByChannel[accountID][channel]++
				}
				delete(oneShotNextChannels, accountID)
				delete(transientRetriedChannels, accountID)
				if mailboxCounts[accountID] >= defaultMailboxSchedulerTarget {
					skippedThisBatch[accountID] = true
					job.addEventLocked("target_reached", fmt.Sprintf("%s 已达到每账号 %d 个邮箱目标", s.schedulerMailboxAccountLabel(accountID), defaultMailboxSchedulerTarget), batch, mailbox, nil)
				}
			}
			job.addEventLocked("created", schedulerMailboxCreatedMessage(index, s.schedulerMailboxAccountLabel(mailbox.AccountID), channel, mailbox.Email), batch, mailbox, nil)
		}
		if len(failures) > 0 {
			for _, failure := range failures {
				accountID := strings.TrimSpace(failure.AccountID)
				accountLabel := schedulerFailureAccountLabel(failure)
				channel := normalizeMailboxCreateChannel(mailboxCreateChannel(failure.Channel))
				if channel == mailboxCreateChannelAuto {
					channel = activeRequestChannel(activeRequests, accountID)
				}
				oneShotChannel := oneShotNextChannels[accountID]
				wasOneShot := normalizeMailboxCreateChannel(oneShotChannel) == channel && channel != mailboxCreateChannelAuto
				delete(oneShotNextChannels, accountID)
				if accountID != "" && channel != mailboxCreateChannelAuto && !schedulerTransientCreateFailure(failure) {
					disableSchedulerCreateChannel(disabledChannels, accountID, channel)
				}
				if accountID != "" {
					if schedulerTransientCreateFailure(failure) {
						if !schedulerTransientCreateRetried(transientRetriedChannels, accountID, channel) {
							markSchedulerTransientCreateRetried(transientRetriedChannels, accountID, channel)
							oneShotNextChannels[accountID] = channel
							job.state.LastError = failure.Error
							job.addEventLocked("channel_failed", schedulerChannelRetryMessage(index, accountLabel, channel, failure.Error), batch, Mailbox{}, errors.New(failure.Error))
							continue
						}
						disableSchedulerCreateChannel(disabledChannels, accountID, channel)
						if nextChannel, ok := nextSchedulerCreateChannelAfter(accountChannels[accountID], disabledChannels[accountID], channel); ok {
							oneShotNextChannels[accountID] = nextChannel
							job.state.LastError = failure.Error
							job.addEventLocked("channel_failed", schedulerChannelFailedMessage(index, accountLabel, channel, failure.Error, nextChannel), batch, Mailbox{}, errors.New(failure.Error))
							continue
						}
						skippedThisBatch[accountID] = true
					} else if wasOneShot {
						disableSchedulerCreateChannel(disabledChannels, accountID, channel)
						skippedThisBatch[accountID] = true
					} else if nextChannel, ok := nextSchedulerCreateChannel(accountChannels[accountID], disabledChannels[accountID]); ok {
						job.state.LastError = failure.Error
						job.addEventLocked("channel_failed", schedulerChannelFailedMessage(index, accountLabel, channel, failure.Error, nextChannel), batch, Mailbox{}, errors.New(failure.Error))
						continue
					} else {
						skippedThisBatch[accountID] = true
					}
				}
				job.state.Failed++
				job.state.LastError = failure.Error
				job.addEventLocked("failed", schedulerAccountFailedMessage(index, accountLabel, channel, failure.Error), batch, Mailbox{}, errors.New(failure.Error))
			}
		}
		hasNextRound := len(activeSchedulerCreateRequests(batchAccountIDs, accountChannels, disabledChannels, skippedThisBatch, oneShotNextChannels, createdByChannel)) > 0
		job.mu.Unlock()
		if hasNextRound {
			if err := waitMailboxSchedulerRoundInterval(ctx, cfg.RoundInterval); err != nil {
				return false
			}
		}
	}
}
