package app

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

func (c *ICloudClient) CheckMailSession(ctx context.Context, session ICloudSession) error {
	if strings.TrimSpace(session.DSID) == "" || !iCloudWebLoginSaved(session) {
		return errCode("icloud_session_missing", "未保存 iCloud 登录态，请先协议登录", true)
	}
	if _, err := mailGatewayBaseURL(session); err != nil {
		return err
	}
	_, err := c.mailFolders(ctx, session)
	return err
}

type mailFolder struct {
	ID           string `json:"identifier"`
	Name         string `json:"name"`
	MessageCount int    `json:"messageCount"`
}

type mailThread struct {
	ThreadID   string
	Subject    string
	Preview    string
	ReceivedAt time.Time
}

func (c *ICloudClient) mailFolders(ctx context.Context, session ICloudSession) ([]mailFolder, error) {
	var out struct {
		DomainObjects []mailFolder `json:"domainObjects"`
	}
	body := map[string]any{
		"domain":        "mailbox",
		"includeLabels": true,
		"predicate": map[string]any{
			"type": "eq",
			"expression": map[string]any{
				"type":     "property",
				"property": "isMboxDeleted",
			},
			"value": false,
		},
		"properties": []string{"identifier", "name", "uidValidity", "unseenCount", "seenDeletedCount", "unseenDeletedCount", "messageCount", "flags"},
	}
	if err := c.callMail(ctx, session, "/mailws2/v1/geqs/query", body, "fetchMailboxCountQuery", &out); err != nil {
		return nil, err
	}
	return out.DomainObjects, nil
}

func preferredMailFolders(folders []mailFolder) []mailFolder {
	if len(folders) == 0 {
		return []mailFolder{{Name: "INBOX"}}
	}
	var out []mailFolder
	seen := map[string]bool{}
	add := func(folder mailFolder) {
		name := strings.TrimSpace(folder.Name)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		out = append(out, folder)
	}
	for _, folder := range folders {
		if folder.Name == "INBOX" || strings.HasPrefix(folder.Name, "INBOX/$category$_") {
			add(folder)
		}
	}
	for _, folder := range folders {
		if folder.MessageCount > 0 && !strings.Contains(folder.Name, "Deleted") && folder.Name != "Sent Messages" && folder.Name != "Drafts" {
			add(folder)
		}
	}
	if len(out) == 0 {
		out = append(out, mailFolder{Name: "INBOX"})
	}
	return out
}

func (c *ICloudClient) searchThreads(ctx context.Context, session ICloudSession, folder mailFolder, maxThreads int) ([]mailThread, error) {
	var out struct {
		ThreadList []struct {
			ThreadID  string          `json:"threadId"`
			Subject   string          `json:"subject"`
			Preview   string          `json:"preview"`
			Timestamp json.RawMessage `json:"timestamp"`
		} `json:"threadList"`
	}
	body := map[string]any{
		"responseType":        "THREAD_DIGEST",
		"includeFolderStatus": false,
		"maxResults":          maxThreads,
		"sessionHeaders":      mailSessionHeaders(folder.Name, false),
	}
	if err := c.callMail(ctx, session, "/mailws2/v1/thread/search", body, "", &out); err != nil {
		return nil, err
	}
	threads := make([]mailThread, 0, len(out.ThreadList))
	for _, item := range out.ThreadList {
		threads = append(threads, mailThread{
			ThreadID:   item.ThreadID,
			Subject:    item.Subject,
			Preview:    item.Preview,
			ReceivedAt: parseMailTime(item.Timestamp),
		})
	}
	return threads, nil
}

func (c *ICloudClient) threadMessages(ctx context.Context, session ICloudSession, folder mailFolder, threadID, alias string, after time.Time) ([]ICloudSyncedMessage, error) {
	messagesByAlias, err := c.threadMessagesForAliases(ctx, session, folder, threadID, map[string]string{"single": alias}, map[string]time.Time{"single": after})
	if err != nil {
		return nil, err
	}
	return messagesByAlias["single"], nil
}

func (c *ICloudClient) threadMessagesForAliases(ctx context.Context, session ICloudSession, folder mailFolder, threadID string, aliases map[string]string, afterByMailbox map[string]time.Time) (map[string][]ICloudSyncedMessage, error) {
	var out struct {
		MessageMetadataList []struct {
			UID       json.RawMessage `json:"uid"`
			Folder    string          `json:"folder"`
			MessageID string          `json:"messageId"`
			Subject   string          `json:"subject"`
			Preview   string          `json:"preview"`
			Date      json.RawMessage `json:"date"`
			From      json.RawMessage `json:"from"`
			To        json.RawMessage `json:"to"`
			CC        json.RawMessage `json:"cc"`
			BCC       json.RawMessage `json:"bcc"`
			Parts     []struct {
				PartID      string `json:"partId"`
				ContentType string `json:"contentType"`
				IsAttach    bool   `json:"isAttach"`
				FileName    string `json:"fileName"`
				Disposition string `json:"disposition"`
			} `json:"parts"`
		} `json:"messageMetadataList"`
	}
	body := map[string]any{
		"threadId":       threadID,
		"sessionHeaders": mailSessionHeaders(folder.Name, false),
	}
	if err := c.callMail(ctx, session, "/mailws2/v1/thread/get", body, "", &out); err != nil {
		return nil, err
	}
	messages := make(map[string][]ICloudSyncedMessage)
	for _, meta := range out.MessageMetadataList {
		uid := rawScalarString(meta.UID)
		if uid == "" {
			continue
		}
		receivedAt := firstNonZeroTime(parseMailTime(meta.Date), time.Now())
		folderName := firstNonEmpty(cleanMailFolder(meta.Folder), folder.Name)
		from := addressSummary(meta.From)
		recipients := string(meta.To) + "\n" + string(meta.CC) + "\n" + string(meta.BCC)
		bodyText := meta.Subject + "\n" + meta.Preview
		partIDs := textPartIDs(meta.Parts)
		if len(partIDs) > 0 {
			detail, err := c.messageBody(ctx, session, folderName, uid, partIDs)
			if err != nil {
				return messages, err
			}
			recipients += "\n" + detail.LongHeader
			bodyText += "\n" + detail.Body
		}
		matchedMailboxIDs := matchingMailboxIDs(recipients, aliases)
		if len(matchedMailboxIDs) == 0 {
			continue
		}
		message := ICloudSyncedMessage{
			RemoteID:   "icloud:" + folderName + ":" + uid,
			UID:        uid,
			Subject:    meta.Subject,
			From:       from,
			Body:       normalizeMailBody(bodyText),
			ReceivedAt: receivedAt,
		}
		for _, mailboxID := range matchedMailboxIDs {
			after := afterByMailbox[mailboxID]
			if !after.IsZero() && receivedAt.Before(after) {
				continue
			}
			messages[mailboxID] = append(messages[mailboxID], message)
		}
	}
	return messages, nil
}

func matchingMailboxIDs(recipients string, aliases map[string]string) []string {
	if len(aliases) == 0 {
		return nil
	}
	var ids []string
	for mailboxID, alias := range aliases {
		if strings.TrimSpace(mailboxID) == "" || strings.TrimSpace(alias) == "" {
			continue
		}
		if containsFold(recipients, alias) {
			ids = append(ids, mailboxID)
		}
	}
	sort.Strings(ids)
	return ids
}

type mailMessageDetail struct {
	LongHeader string
	Body       string
}

func (c *ICloudClient) messageBody(ctx context.Context, session ICloudSession, folderName, uid string, partIDs []string) (mailMessageDetail, error) {
	var out struct {
		LongHeader string `json:"longHeader"`
		Parts      []struct {
			GUID    string `json:"guid"`
			Content string `json:"content"`
		} `json:"parts"`
	}
	body := map[string]any{
		"uid":            uid,
		"parts":          partIDs,
		"dontMarkAsRead": true,
		"sessionHeaders": mailSessionHeaders(folderName, false),
	}
	if err := c.callMail(ctx, session, "/mailws2/v1/message/get", body, "", &out); err != nil {
		return mailMessageDetail{}, err
	}
	var parts []string
	for _, part := range out.Parts {
		parts = append(parts, part.Content)
	}
	return mailMessageDetail{LongHeader: out.LongHeader, Body: strings.Join(parts, "\n")}, nil
}
