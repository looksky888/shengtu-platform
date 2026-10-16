package app

import (
	"strconv"
	"strings"
	"time"
)

func imapSearchCommand(state LoginState, mailboxes []Mailbox, after time.Time) string {
	if uid := imapUIDNumber(state.IMAPLastSyncUID); uid > 0 {
		return "UID SEARCH UID " + strconv.Itoa(uid+1) + ":*"
	}
	nextUID := 0
	for _, mailbox := range mailboxes {
		uid := imapUIDNumber(mailbox.LastSyncUID)
		if uid <= 0 {
			nextUID = 0
			break
		}
		if nextUID == 0 || uid+1 < nextUID {
			nextUID = uid + 1
		}
	}
	if nextUID > 0 {
		return "UID SEARCH UID " + strconv.Itoa(nextUID) + ":*"
	}
	searchAfter := after
	if searchAfter.IsZero() {
		searchAfter = time.Now().Add(-24 * time.Hour)
	}
	return "UID SEARCH SINCE " + searchAfter.Format("2-Jan-2006")
}

func imapSelectLastUID(lines []string) int {
	for _, line := range lines {
		upper := strings.ToUpper(line)
		idx := strings.Index(upper, "UIDNEXT")
		if idx < 0 {
			continue
		}
		tail := line[idx+len("UIDNEXT"):]
		fields := strings.FieldsFunc(tail, func(r rune) bool {
			return r < '0' || r > '9'
		})
		if len(fields) == 0 {
			continue
		}
		nextUID, err := strconv.Atoi(fields[0])
		if err == nil && nextUID > 1 {
			return nextUID - 1
		}
	}
	return 0
}

func imapUIDNumber(value string) int {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "imap:")
	uid, err := strconv.Atoi(value)
	if err != nil || uid <= 0 {
		return 0
	}
	return uid
}

func imapLineHasExistsEvent(line string) bool {
	parts := strings.Fields(strings.TrimSpace(line))
	return len(parts) >= 3 && parts[0] == "*" && strings.EqualFold(parts[2], "EXISTS")
}
