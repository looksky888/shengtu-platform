package app

import (
	"bufio"
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func SyncICloudIMAPMessages(ctx context.Context, state LoginState, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (map[string][]ICloudSyncedMessage, error) {
	result, err := SyncICloudIMAPMessagesWithCursor(ctx, state, mailboxes, after, keyword, maxMessages)
	if err != nil {
		return nil, err
	}
	return result.MessagesByMailbox, nil
}

func LatestICloudIMAPUID(ctx context.Context, state LoginState) (string, error) {
	state, err := normalizeICloudIMAPState(state)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	conn, err := dialICloudIMAPTLS(ctx, state.IMAPHost, state.IMAPPort)
	if err != nil {
		return "", errCode("imap_connect_failed", "连接 iCloud IMAP 失败："+err.Error(), true)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))

	reader := bufio.NewReader(conn)
	greeting, err := reader.ReadString('\n')
	if err != nil {
		return "", errCode("imap_greeting_failed", "读取 iCloud IMAP 欢迎信息失败："+err.Error(), true)
	}
	if !strings.Contains(strings.ToUpper(greeting), "OK") {
		return "", errCode("imap_greeting_failed", "iCloud IMAP 未就绪："+imapResponseSummary([]string{greeting}), true)
	}
	loginLines, err := imapCommand(conn, reader, "A001", "LOGIN "+imapQuote(state.IMAPUsername)+" "+imapQuote(state.IMAPAppPassword))
	if err != nil {
		return "", errCode("imap_login_failed", "iCloud IMAP 登录请求失败："+err.Error(), true)
	}
	if !imapTaggedOK(loginLines, "A001") {
		return "", errCode("imap_login_failed", "iCloud IMAP 登录失败，请确认 iCloud 邮箱账号和 App 专用密码："+imapResponseSummary(loginLines), false)
	}
	selectLines, err := imapCommand(conn, reader, "A002", "SELECT INBOX")
	if err != nil {
		return "", errCode("imap_select_failed", "打开 iCloud 收件箱失败："+err.Error(), true)
	}
	if !imapTaggedOK(selectLines, "A002") {
		return "", errCode("imap_select_failed", "打开 iCloud 收件箱失败："+imapResponseSummary(selectLines), true)
	}
	_, _ = imapCommand(conn, reader, "A003", "LOGOUT")
	uid := imapSelectLastUID(selectLines)
	if uid <= 0 {
		return "", nil
	}
	return strconv.Itoa(uid), nil
}

func SyncICloudIMAPMessagesWithCursor(ctx context.Context, state LoginState, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (iCloudIMAPSyncResult, error) {
	state, err := normalizeICloudIMAPState(state)
	if err != nil {
		return iCloudIMAPSyncResult{}, err
	}
	if maxMessages <= 0 {
		maxMessages = 50
	}
	if maxMessages > 200 {
		maxMessages = 200
	}
	if keyword = strings.TrimSpace(keyword); keyword == "" {
		keyword = "OpenAI"
	}
	if len(mailboxes) == 0 {
		return iCloudIMAPSyncResult{MessagesByMailbox: map[string][]ICloudSyncedMessage{}}, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	conn, err := dialICloudIMAPTLS(ctx, state.IMAPHost, state.IMAPPort)
	if err != nil {
		return iCloudIMAPSyncResult{}, errCode("imap_connect_failed", "连接 iCloud IMAP 失败："+err.Error(), true)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(60 * time.Second))

	reader := bufio.NewReader(conn)
	greeting, err := reader.ReadString('\n')
	if err != nil {
		return iCloudIMAPSyncResult{}, errCode("imap_greeting_failed", "读取 iCloud IMAP 欢迎信息失败："+err.Error(), true)
	}
	if !strings.Contains(strings.ToUpper(greeting), "OK") {
		return iCloudIMAPSyncResult{}, errCode("imap_greeting_failed", "iCloud IMAP 未就绪："+imapResponseSummary([]string{greeting}), true)
	}
	loginLines, err := imapCommand(conn, reader, "A001", "LOGIN "+imapQuote(state.IMAPUsername)+" "+imapQuote(state.IMAPAppPassword))
	if err != nil {
		return iCloudIMAPSyncResult{}, errCode("imap_login_failed", "iCloud IMAP 登录请求失败："+err.Error(), true)
	}
	if !imapTaggedOK(loginLines, "A001") {
		return iCloudIMAPSyncResult{}, errCode("imap_login_failed", "iCloud IMAP 登录失败，请确认 iCloud 邮箱账号和 App 专用密码："+imapResponseSummary(loginLines), false)
	}
	// Search INBOX plus common junk folders — OpenAI OTP occasionally lands in Junk.
	folders := []string{"INBOX", "Junk", "Spam", "Bulk Mail", "垃圾邮件"}
	fetched := make([]iCloudIMAPFetchedMessage, 0, maxMessages)
	lastUID := ""
	tag := 2
	for _, folder := range folders {
		tag++
		selectTag := fmt.Sprintf("A%03d", tag)
		selectLines, err := imapCommand(conn, reader, selectTag, "SELECT "+imapQuote(folder))
		if err != nil {
			if folder == "INBOX" {
				return iCloudIMAPSyncResult{}, errCode("imap_select_failed", "打开 iCloud 收件箱失败："+err.Error(), true)
			}
			continue
		}
		if !imapTaggedOK(selectLines, selectTag) {
			if folder == "INBOX" {
				return iCloudIMAPSyncResult{}, errCode("imap_select_failed", "打开 iCloud 收件箱失败："+imapResponseSummary(selectLines), true)
			}
			continue
		}
		tag++
		searchTag := fmt.Sprintf("A%03d", tag)
		searchLines, err := imapCommand(conn, reader, searchTag, imapSearchCommand(state, mailboxes, after))
		if err != nil {
			if folder == "INBOX" {
				return iCloudIMAPSyncResult{}, errCode("imap_search_failed", "搜索 iCloud IMAP 邮件失败："+err.Error(), true)
			}
			continue
		}
		if !imapTaggedOK(searchLines, searchTag) {
			if folder == "INBOX" {
				return iCloudIMAPSyncResult{}, errCode("imap_search_failed", "搜索 iCloud IMAP 邮件失败："+imapResponseSummary(searchLines), true)
			}
			continue
		}
		uids := imapSearchUIDs(searchLines)
		if len(uids) == 0 {
			continue
		}
		sortInts(uids)
		uids = lastIntValues(uids, maxMessages)
		if len(uids) > 0 {
			lastUID = strconv.Itoa(uids[len(uids)-1])
		}
		for _, chunk := range chunkInts(uids, 20) {
			tag++
			fetchTag := fmt.Sprintf("A%03d", tag)
			lines, literals, err := imapCommandWithLiterals(conn, reader, fetchTag, "UID FETCH "+imapUIDSet(chunk)+" (UID BODY.PEEK[]<0.200000>)")
			if err != nil {
				if folder == "INBOX" {
					return iCloudIMAPSyncResult{}, errCode("imap_fetch_failed", "读取 iCloud IMAP 邮件失败："+err.Error(), true)
				}
				break
			}
			if !imapTaggedOK(lines, fetchTag) {
				if folder == "INBOX" {
					return iCloudIMAPSyncResult{}, errCode("imap_fetch_failed", "读取 iCloud IMAP 邮件失败："+imapResponseSummary(lines), true)
				}
				break
			}
			fetchUIDs := imapFetchUIDs(lines)
			for i, raw := range literals {
				uid := ""
				if i < len(fetchUIDs) {
					uid = strconv.Itoa(fetchUIDs[i])
				}
				// Prefix folder so UIDs from Junk/INBOX do not collide in remote_id.
				if uid != "" && folder != "INBOX" {
					uid = folder + ":" + uid
				}
				fetched = append(fetched, iCloudIMAPFetchedMessage{UID: uid, Raw: raw})
			}
		}
	}
	tag++
	_, _ = imapCommand(conn, reader, fmt.Sprintf("A%03d", tag), "LOGOUT")
	return iCloudIMAPSyncResult{
		MessagesByMailbox: iCloudIMAPMessagesByMailbox(fetched, mailboxes, after, keyword, state.IMAPEmail, state.IMAPUsername),
		LastUID:           lastUID,
	}, nil
}
