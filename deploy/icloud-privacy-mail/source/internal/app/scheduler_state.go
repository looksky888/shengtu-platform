package app

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

func (j *mailboxSchedulerJob) running() bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.state.Running
}

func (j *mailboxSchedulerJob) stop(message string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.cancel != nil {
		j.cancel()
		j.cancel = nil
	}
	if j.state.Running {
		j.state.Running = false
		j.state.Status = "stopped"
		j.state.NextRunAt = time.Time{}
		j.state.StoppedAt = time.Now()
		j.addEventLocked("stopped", message, j.state.BatchIndex, Mailbox{}, nil)
	}
}

func (j *mailboxSchedulerJob) snapshot() (mailboxSchedulerState, []mailboxSchedulerEvent) {
	j.mu.Lock()
	defer j.mu.Unlock()
	state := j.state
	events := make([]mailboxSchedulerEvent, len(j.events))
	copy(events, j.events)
	return state, events
}

func (j *mailboxSchedulerJob) clearEvents() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.events = nil
}

func (j *mailboxSchedulerJob) addEventLocked(kind, message string, batch int, mailbox Mailbox, err error) {
	j.nextEventID++
	event := mailboxSchedulerEvent{
		ID:      j.nextEventID,
		At:      time.Now(),
		Type:    kind,
		Message: message,
		Batch:   batch,
	}
	if mailbox.ID != "" {
		event.MailboxID = mailbox.ID
		event.Email = mailbox.Email
	}
	if err != nil {
		event.Error = schedulerErrorMessage(err)
	}
	j.events = append([]mailboxSchedulerEvent{event}, j.events...)
	if len(j.events) > maxMailboxSchedulerEvents {
		j.events = j.events[:maxMailboxSchedulerEvents]
	}
}

func schedulerMailboxLabel(base string, batch, index, total int) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "UPI-" + time.Now().Format("0102-150405")
	}
	if total <= 0 {
		if index <= 1 {
			return base
		}
		return fmt.Sprintf("%s-B%03d-%02d", base, batch, index)
	}
	if total <= 1 {
		return base
	}
	width := len(fmt.Sprintf("%d", total))
	if width < 2 {
		width = 2
	}
	return fmt.Sprintf("%s-B%03d-%0*d", base, batch, width, index)
}

func schedulerErrorMessage(err error) string {
	var coded codedError
	if errors.As(err, &coded) {
		return coded.message
	}
	return err.Error()
}
