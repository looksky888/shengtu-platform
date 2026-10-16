package app

import (
	"context"
	"sort"
	"strings"
	"time"
)

func (c *ICloudClient) SyncMailboxMessages(ctx context.Context, session ICloudSession, mailbox Mailbox, after time.Time, keyword string, maxThreads int) ([]ICloudSyncedMessage, error) {
	if strings.TrimSpace(session.DSID) == "" || len(session.Cookies) == 0 {
		return nil, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先协议登录", true)
	}
	if strings.TrimSpace(mailbox.Email) == "" {
		return nil, errCode("mailbox_email_missing", "邮箱地址为空", false)
	}
	if maxThreads <= 0 || maxThreads > 50 {
		maxThreads = 20
	}
	if keyword = strings.TrimSpace(keyword); keyword == "" {
		keyword = "OpenAI"
	}
	queryAfter := mailboxSyncAfter(mailbox, after, time.Now())
	folders, err := c.mailFolders(ctx, session)
	if err != nil {
		return nil, err
	}
	folders = preferredMailFolders(folders)
	var out []ICloudSyncedMessage
	for _, folder := range folders {
		threads, err := c.searchThreads(ctx, session, folder, maxThreads)
		if err != nil {
			return out, err
		}
		for _, thread := range threads {
			if shouldSkipSyncedThread(thread, queryAfter) {
				continue
			}
			text := thread.Subject + "\n" + thread.Preview
			if !looksLikeVerificationText(text, keyword) {
				continue
			}
			messages, err := c.threadMessages(ctx, session, folder, thread.ThreadID, mailbox.Email, queryAfter)
			if err != nil {
				return out, err
			}
			out = append(out, messages...)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].ReceivedAt.After(out[j].ReceivedAt)
	})
	return out, nil
}

func (c *ICloudClient) SyncMailboxMessagesBatch(ctx context.Context, session ICloudSession, mailboxes []Mailbox, after time.Time, keyword string, maxThreads int) (map[string][]ICloudSyncedMessage, error) {
	if strings.TrimSpace(session.DSID) == "" || len(session.Cookies) == 0 {
		return nil, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先协议登录", true)
	}
	if maxThreads <= 0 || maxThreads > 50 {
		maxThreads = 50
	}
	if keyword = strings.TrimSpace(keyword); keyword == "" {
		keyword = "OpenAI"
	}
	now := time.Now()
	aliases := make(map[string]string)
	afterByMailbox := make(map[string]time.Time)
	var queryAfter time.Time
	for _, mailbox := range mailboxes {
		email := strings.ToLower(strings.TrimSpace(mailbox.Email))
		if strings.TrimSpace(mailbox.ID) == "" || email == "" {
			continue
		}
		aliases[mailbox.ID] = email
		mailboxAfter := mailboxSyncAfter(mailbox, after, now)
		afterByMailbox[mailbox.ID] = mailboxAfter
		if queryAfter.IsZero() || mailboxAfter.Before(queryAfter) {
			queryAfter = mailboxAfter
		}
	}
	if len(aliases) == 0 {
		return map[string][]ICloudSyncedMessage{}, nil
	}
	folders, err := c.mailFolders(ctx, session)
	if err != nil {
		return nil, err
	}
	folders = preferredMailFolders(folders)
	out := make(map[string][]ICloudSyncedMessage, len(aliases))
	for _, folder := range folders {
		threads, err := c.searchThreads(ctx, session, folder, maxThreads)
		if err != nil {
			return out, err
		}
		for _, thread := range threads {
			if shouldSkipSyncedThread(thread, queryAfter) {
				continue
			}
			text := thread.Subject + "\n" + thread.Preview
			if !looksLikeVerificationText(text, keyword) {
				continue
			}
			messagesByMailbox, err := c.threadMessagesForAliases(ctx, session, folder, thread.ThreadID, aliases, afterByMailbox)
			if err != nil {
				return out, err
			}
			for mailboxID, messages := range messagesByMailbox {
				out[mailboxID] = append(out[mailboxID], messages...)
			}
		}
	}
	for mailboxID := range out {
		sort.SliceStable(out[mailboxID], func(i, j int) bool {
			return out[mailboxID][i].ReceivedAt.After(out[mailboxID][j].ReceivedAt)
		})
	}
	return out, nil
}

func mailboxSyncAfter(mailbox Mailbox, after time.Time, now time.Time) time.Time {
	queryAfter := after
	if !mailbox.LastSyncAt.IsZero() {
		cursor := mailbox.LastSyncAt.Add(-mailboxSyncCursorOverlap)
		if cursor.After(queryAfter) {
			queryAfter = cursor
		}
	}
	if queryAfter.After(now) {
		return now.Add(-mailboxSyncCursorOverlap)
	}
	return queryAfter
}

func shouldSkipSyncedThread(thread mailThread, after time.Time) bool {
	return !after.IsZero() && !thread.ReceivedAt.IsZero() && thread.ReceivedAt.Before(after)
}

func looksLikeVerificationText(text, keyword string) bool {
	if extractOTP(text) != "" {
		return true
	}
	needles := []string{"openai", "chatgpt", "code", "otp", "verification", "verify", "验证码", "验证", "代码"}
	if strings.TrimSpace(keyword) != "" {
		needles = append(needles, strings.ToLower(strings.TrimSpace(keyword)))
	}
	lower := strings.ToLower(text)
	for _, needle := range needles {
		if needle != "" && strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}
