package app

import (
	"net/http"
	"strings"
)

func (s *Server) mailboxScheduler(ownerID string) *mailboxSchedulerJob {
	s.schedulerMu.Lock()
	defer s.schedulerMu.Unlock()
	return s.mailboxSchedulers[strings.TrimSpace(ownerID)]
}

func (s *Server) publicMailboxScheduler(r *http.Request) publicMailboxScheduler {
	ownerID := requestOwnerID(r, s.store)
	job := s.mailboxScheduler(ownerID)
	if job == nil {
		return publicMailboxScheduler{
			BatchSize:            defaultMailboxSchedulerBatchSize,
			TargetPerAccount:     defaultMailboxSchedulerTarget,
			AppleAccountQuota:    mailboxSchedulerAppleQuota,
			ICloudWebQuota:       mailboxSchedulerICloudQuota,
			IntervalSeconds:      int(defaultMailboxSchedulerInterval.Seconds()),
			IntervalMinutes:      int(defaultMailboxSchedulerInterval.Minutes()),
			RoundIntervalSeconds: int(defaultMailboxSchedulerRoundInterval.Seconds()),
			CreateChannel:        string(mailboxCreateChannelAuto),
			CreateChannelLabel:   mailboxCreateChannelLabel(mailboxCreateChannelAuto),
			Status:               "stopped",
			Events:               []publicMailboxSchedulerEvent{},
		}
	}
	state, events := job.snapshot()
	out := publicMailboxScheduler{
		Running:              state.Running,
		Owner:                state.Owner,
		AccountID:            state.AccountID,
		AccountIDs:           append([]string(nil), state.AccountIDs...),
		Label:                state.Label,
		Note:                 state.Note,
		CreateChannel:        string(normalizeMailboxCreateChannel(state.CreateChannel)),
		CreateChannelLabel:   mailboxCreateChannelLabel(state.CreateChannel),
		BatchSize:            state.BatchSize,
		TargetPerAccount:     state.TargetPerAccount,
		AppleAccountQuota:    mailboxSchedulerAppleQuota,
		ICloudWebQuota:       mailboxSchedulerICloudQuota,
		IntervalSeconds:      state.IntervalSeconds,
		IntervalMinutes:      state.IntervalSeconds / 60,
		RoundIntervalSeconds: state.RoundIntervalSeconds,
		Status:               state.Status,
		BatchIndex:           state.BatchIndex,
		Success:              state.Success,
		Failed:               state.Failed,
		StartedAt:            formatTime(state.StartedAt),
		LastRunAt:            formatTime(state.LastRunAt),
		NextRunAt:            formatTime(state.NextRunAt),
		StoppedAt:            formatTime(state.StoppedAt),
		LastError:            state.LastError,
		Events:               make([]publicMailboxSchedulerEvent, 0, len(events)),
	}
	for _, event := range events {
		item := publicMailboxSchedulerEvent{
			ID:        event.ID,
			At:        formatTime(event.At),
			Type:      event.Type,
			Message:   event.Message,
			Batch:     event.Batch,
			MailboxID: event.MailboxID,
			Email:     event.Email,
			Error:     event.Error,
		}
		if event.MailboxID != "" {
			if mailbox, ok := s.store.FindMailboxByID(event.MailboxID); ok && (ownerID == "" || constantTimeEqual(ownerID, mailbox.OwnerID) || s.isAdminRequest(r)) {
				item.APIURL = s.mailboxAPIURL(r, mailbox)
			}
		}
		out.Events = append(out.Events, item)
	}
	return out
}
