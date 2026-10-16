package app

import (
	"bytes"
	"io"
	"net/mail"
	"strings"
	"time"
)

type iCloudIMAPFetchedMessage struct {
	UID string
	Raw []byte
}

func iCloudIMAPMessagesByMailbox(fetched []iCloudIMAPFetchedMessage, mailboxes []Mailbox, after time.Time, keyword string, ignoredEmails ...string) map[string][]ICloudSyncedMessage {
	now := time.Now()
	aliases := make(map[string]string)
	afterByMailbox := make(map[string]time.Time)
	ignored := make(map[string]struct{}, len(ignoredEmails))
	for _, email := range ignoredEmails {
		if email = normalizeICloudIMAPEmail(email); email != "" {
			ignored[email] = struct{}{}
		}
	}
	for _, mailbox := range mailboxes {
		id := strings.TrimSpace(mailbox.ID)
		email := normalizeICloudIMAPEmail(mailbox.Email)
		if id == "" || email == "" {
			continue
		}
		if _, skip := ignored[email]; skip {
			continue
		}
		aliases[id] = email
		afterByMailbox[id] = mailboxSyncAfter(mailbox, after, now)
	}
	out := make(map[string][]ICloudSyncedMessage, len(aliases))
	for _, item := range fetched {
		message, recipients, ok := parseICloudIMAPMessage(item)
		if !ok {
			continue
		}
		if !looksLikeVerificationText(message.Subject+"\n"+message.From+"\n"+message.Body, keyword) {
			continue
		}
		matchedMailboxIDs := matchingMailboxIDs(recipients, aliases)
		if len(matchedMailboxIDs) == 0 {
			continue
		}
		for _, mailboxID := range matchedMailboxIDs {
			if after := afterByMailbox[mailboxID]; !after.IsZero() && message.ReceivedAt.Before(after) {
				continue
			}
			out[mailboxID] = append(out[mailboxID], message)
		}
	}
	for mailboxID := range out {
		sortMessagesByReceivedAt(out[mailboxID])
	}
	return out
}

func parseICloudIMAPMessage(item iCloudIMAPFetchedMessage) (ICloudSyncedMessage, string, bool) {
	msg, err := mail.ReadMessage(bytes.NewReader(item.Raw))
	if err != nil {
		return ICloudSyncedMessage{}, "", false
	}
	bodyBytes, _ := io.ReadAll(io.LimitReader(msg.Body, 1<<20))
	body := decodeICloudIMAPBody(msg.Header, bodyBytes)
	subject := decodeMIMEHeader(msg.Header.Get("Subject"))
	from := decodeMIMEHeader(msg.Header.Get("From"))
	receivedAt := time.Now()
	if date, err := msg.Header.Date(); err == nil {
		receivedAt = date
	}
	uid := strings.TrimSpace(item.UID)
	remoteID := "imap"
	if uid != "" {
		remoteID += ":" + uid
	}
	recipients := imapHeaderText(msg.Header)
	return ICloudSyncedMessage{
		RemoteID:   remoteID,
		UID:        uid,
		Subject:    subject,
		From:       from,
		Body:       normalizeMailBody(subject + "\n" + body),
		ReceivedAt: receivedAt,
	}, recipients, true
}

func normalizeICloudIMAPState(state LoginState) (LoginState, error) {
	email := normalizeICloudIMAPEmail(state.IMAPEmail)
	if email == "" {
		email = normalizeICloudIMAPEmail(state.IMAPUsername)
	}
	if email == "" {
		return LoginState{}, errCode("imap_session_missing", "未保存取码登录，请先保存 iCloud 邮箱账号和 App 专用密码", true)
	}
	appPassword := strings.TrimSpace(state.IMAPAppPassword)
	if cleaned := normalizeICloudAppPassword(appPassword); cleaned != "" {
		if compact := strings.ReplaceAll(cleaned, "-", ""); len(compact) == 16 {
			appPassword = strings.ToLower(compact)
		} else {
			appPassword = cleaned
		}
	}
	if appPassword == "" {
		return LoginState{}, errCode("imap_app_password_missing", "取码登录缺少 App 专用密码，请重新保存取码登录", false)
	}
	state.IMAPEmail = email
	state.IMAPUsername = firstNonEmpty(normalizeICloudIMAPEmail(state.IMAPUsername), email)
	state.IMAPHost = firstNonEmpty(strings.TrimSpace(state.IMAPHost), defaultICloudIMAPHost)
	if state.IMAPPort == 0 {
		state.IMAPPort = defaultICloudIMAPPort
	}
	state.IMAPAppPassword = appPassword
	return state, nil
}
