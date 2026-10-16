package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

func (c *ICloudClient) MoveRemoteMessagesToTrash(ctx context.Context, session ICloudSession, remoteIDs []string) (ICloudMailCleanupResult, error) {
	var result ICloudMailCleanupResult
	if strings.TrimSpace(session.DSID) == "" || len(session.Cookies) == 0 {
		return result, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先协议登录", true)
	}
	folders, err := c.mailFolders(ctx, session)
	if err != nil {
		return result, err
	}
	trash, ok := trashMailFolder(folders)
	if !ok || strings.TrimSpace(trash.ID) == "" {
		return result, errCode("icloud_trash_not_found", "未找到 iCloud 废纸篓文件夹", true)
	}

	byFolder := make(map[string][]string)
	for _, remoteID := range remoteIDs {
		folderName, uid, ok := parseICloudRemoteID(remoteID)
		if !ok {
			result.Skipped++
			continue
		}
		if strings.EqualFold(folderName, trash.Name) {
			result.Skipped++
			continue
		}
		byFolder[folderName] = append(byFolder[folderName], uid)
	}
	for folderName, uids := range byFolder {
		folder, ok := findMailFolderByName(folders, folderName)
		if !ok || strings.TrimSpace(folder.ID) == "" {
			result.Skipped += len(uids)
			continue
		}
		ids, err := c.mailMessageIdentifiers(ctx, session, folder, uids)
		if err != nil {
			return result, err
		}
		for _, uid := range uniqueStrings(uids) {
			if strings.TrimSpace(ids[uid]) == "" {
				result.Skipped++
			}
		}
		moved, err := c.moveMailIdentifiersToTrash(ctx, session, mapValues(ids), trash.ID)
		result.MovedToTrash += moved
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

func (c *ICloudClient) EmptyTrash(ctx context.Context, session ICloudSession) (int, error) {
	if strings.TrimSpace(session.DSID) == "" || len(session.Cookies) == 0 {
		return 0, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先协议登录", true)
	}
	folders, err := c.mailFolders(ctx, session)
	if err != nil {
		return 0, err
	}
	trash, ok := trashMailFolder(folders)
	if !ok || strings.TrimSpace(trash.ID) == "" {
		return 0, errCode("icloud_trash_not_found", "未找到 iCloud 废纸篓文件夹", true)
	}

	total := 0
	for i := 0; i < 20; i++ {
		ids, err := c.mailFolderMessageIdentifiers(ctx, session, trash, 1000)
		if err != nil {
			return total, err
		}
		if len(ids) == 0 {
			return total, nil
		}
		destroyed, err := c.destroyMailIdentifiers(ctx, session, ids)
		total += destroyed
		if err != nil {
			return total, err
		}
		if len(ids) < 1000 {
			return total, nil
		}
	}
	return total, errCode("icloud_trash_not_empty", "废纸篓邮件过多，本次已分批清理一部分，请再点一次", true)
}

type mailEmailObject struct {
	UID        json.RawMessage `json:"uid"`
	Identifier string          `json:"identifier"`
	MboxRef    struct {
		ID string `json:"id"`
	} `json:"mboxRef"`
}

func (c *ICloudClient) mailMessageIdentifiers(ctx context.Context, session ICloudSession, folder mailFolder, uids []string) (map[string]string, error) {
	out := make(map[string]string)
	for _, chunk := range chunkStrings(uniqueStrings(uids), 200) {
		var resp struct {
			DomainObjects []mailEmailObject `json:"domainObjects"`
		}
		body := map[string]any{
			"domain": "email",
			"predicate": map[string]any{
				"type":       "in",
				"expression": map[string]any{"property": "uid"},
				"value":      mailUIDValues(chunk),
				"and": []any{
					map[string]any{
						"type": "eq",
						"expression": map[string]any{
							"type":     "fieldOf",
							"property": "flags",
							"value":    "DELETED",
						},
						"value": false,
					},
					map[string]any{
						"type":       "eq",
						"expression": map[string]any{"property": "mboxRef"},
						"value":      folder.ID,
					},
				},
			},
			"properties": []string{"uid", "identifier", "mboxRef"},
		}
		if err := c.callMail(ctx, session, "/mailws2/v1/message/list", body, "", &resp); err != nil {
			return out, err
		}
		for _, item := range resp.DomainObjects {
			uid := rawScalarString(item.UID)
			identifier := strings.TrimSpace(item.Identifier)
			if uid == "" || identifier == "" {
				continue
			}
			out[uid] = identifier
		}
	}
	return out, nil
}

func (c *ICloudClient) mailFolderMessageIdentifiers(ctx context.Context, session ICloudSession, folder mailFolder, limit int) ([]string, error) {
	if limit <= 0 || limit > 1000 {
		limit = 1000
	}
	var resp struct {
		DomainObjects []mailEmailObject `json:"domainObjects"`
	}
	body := map[string]any{
		"domain":     "email",
		"properties": []string{"uid", "identifier", "stateInternalDate", "mboxRef"},
		"limit":      limit,
		"predicate": map[string]any{
			"type":       "eq",
			"expression": map[string]any{"property": "mboxRef"},
			"value":      folder.ID,
			"and": []any{
				map[string]any{
					"type": "eq",
					"expression": map[string]any{
						"type":     "fieldOf",
						"property": "flags",
						"value":    "DELETED",
					},
					"value": false,
				},
			},
		},
		"orderby": map[string]any{
			"expressions": []any{map[string]any{"property": "stateInternalDate", "type": "property"}},
			"ascending":   false,
		},
	}
	if err := c.callMail(ctx, session, "/mailws2/v1/message/list", body, "", &resp); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(resp.DomainObjects))
	for _, item := range resp.DomainObjects {
		if identifier := strings.TrimSpace(item.Identifier); identifier != "" {
			ids = append(ids, identifier)
		}
	}
	return ids, nil
}

type mailSetResponse struct {
	Updated      map[string]json.RawMessage `json:"updated"`
	Destroyed    []string                   `json:"destroyed"`
	NotUpdated   map[string]json.RawMessage `json:"notUpdated"`
	NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
}

func (c *ICloudClient) moveMailIdentifiersToTrash(ctx context.Context, session ICloudSession, identifiers []string, trashFolderID string) (int, error) {
	identifiers = uniqueStrings(identifiers)
	if len(identifiers) == 0 {
		return 0, nil
	}
	moved := 0
	for _, chunk := range chunkStrings(identifiers, 200) {
		var resp mailSetResponse
		body := map[string]any{
			"domain": "email",
			"batchUpdate": []any{
				map[string]any{
					"ids": chunk,
					"patch": map[string]any{
						"flags":   map[string]any{"set": []string{"seen"}},
						"mboxRef": map[string]any{"replace": []string{trashFolderID}},
					},
				},
			},
		}
		if err := c.callMail(ctx, session, "/mailws2/v1/email/set", body, "", &resp); err != nil {
			return moved, err
		}
		if len(resp.NotUpdated) > 0 {
			return moved + len(resp.Updated), fmt.Errorf("icloud mail move notUpdated=%d", len(resp.NotUpdated))
		}
		if len(resp.Updated) > 0 {
			moved += len(resp.Updated)
		} else {
			moved += len(chunk)
		}
	}
	return moved, nil
}

func (c *ICloudClient) destroyMailIdentifiers(ctx context.Context, session ICloudSession, identifiers []string) (int, error) {
	identifiers = uniqueStrings(identifiers)
	if len(identifiers) == 0 {
		return 0, nil
	}
	destroyed := 0
	for _, chunk := range chunkStrings(identifiers, 200) {
		var resp mailSetResponse
		body := map[string]any{
			"domain":  "email",
			"destroy": chunk,
		}
		if err := c.callMail(ctx, session, "/mailws2/v1/email/set", body, "", &resp); err != nil {
			return destroyed, err
		}
		if len(resp.NotDestroyed) > 0 {
			return destroyed + len(resp.Destroyed), fmt.Errorf("icloud mail destroy notDestroyed=%d", len(resp.NotDestroyed))
		}
		if len(resp.Destroyed) > 0 {
			destroyed += len(resp.Destroyed)
		} else {
			destroyed += len(chunk)
		}
	}
	return destroyed, nil
}

func parseICloudRemoteID(remoteID string) (string, string, bool) {
	rest, ok := strings.CutPrefix(strings.TrimSpace(remoteID), "icloud:")
	if !ok {
		return "", "", false
	}
	folderName, uid, ok := strings.Cut(rest, ":")
	if !ok || strings.TrimSpace(folderName) == "" || strings.TrimSpace(uid) == "" {
		return "", "", false
	}
	return strings.TrimSpace(folderName), strings.TrimSpace(uid), true
}

func findMailFolderByName(folders []mailFolder, name string) (mailFolder, bool) {
	name = strings.TrimSpace(name)
	for _, folder := range folders {
		if strings.EqualFold(strings.TrimSpace(folder.Name), name) {
			return folder, true
		}
	}
	return mailFolder{}, false
}

func trashMailFolder(folders []mailFolder) (mailFolder, bool) {
	for _, folder := range folders {
		name := strings.ToLower(strings.TrimSpace(folder.Name))
		if name == "deleted messages" || name == "trash" || strings.Contains(name, "deleted") || strings.Contains(name, "trash") || strings.Contains(name, "废纸") {
			return folder, true
		}
	}
	return mailFolder{}, false
}

func mailUIDValues(uids []string) []any {
	out := make([]any, 0, len(uids))
	for _, uid := range uids {
		uid = strings.TrimSpace(uid)
		if uid == "" {
			continue
		}
		if n, err := strconv.Atoi(uid); err == nil {
			out = append(out, n)
			continue
		}
		out = append(out, uid)
	}
	return out
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func mapValues(values map[string]string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, value)
		}
	}
	sort.Strings(out)
	return out
}

func chunkStrings(values []string, size int) [][]string {
	if size <= 0 {
		size = len(values)
	}
	var chunks [][]string
	for len(values) > 0 {
		n := size
		if len(values) < n {
			n = len(values)
		}
		chunks = append(chunks, values[:n])
		values = values[n:]
	}
	return chunks
}
