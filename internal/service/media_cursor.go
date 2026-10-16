package service

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	defaultMediaPageLimit = 50
	maxMediaPageLimit     = 100
)

type mediaListCursor struct {
	Version   int    `json:"v"`
	CreatedAt string `json:"created_at"`
	ID        string `json:"id"`
}

func encodeMediaListCursor(createdAt, id string) string {
	raw, err := json.Marshal(mediaListCursor{Version: 1, CreatedAt: createdAt, ID: id})
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeMediaListCursor(value string) (mediaListCursor, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return mediaListCursor{}, false
	}
	var cursor mediaListCursor
	if json.Unmarshal(raw, &cursor) != nil || cursor.Version != 1 || cursor.CreatedAt == "" || cursor.ID == "" {
		return mediaListCursor{}, false
	}
	return cursor, true
}

func mediaCursorAfter(createdAt, id string, cursor mediaListCursor) bool {
	return createdAt < cursor.CreatedAt || (createdAt == cursor.CreatedAt && id < cursor.ID)
}

func normalizeMediaPageLimit(limit int) int {
	if limit < 1 || limit > maxMediaPageLimit {
		return defaultMediaPageLimit
	}
	return limit
}

func mediaPageStart[T any](items []T, cursorValue string, key func(T) (string, string)) (int, error) {
	value := strings.TrimSpace(cursorValue)
	if value == "" {
		return 0, nil
	}
	cursor, ok := decodeMediaListCursor(value)
	if !ok {
		return 0, fmt.Errorf("分页游标无效")
	}
	for index, item := range items {
		createdAt, id := key(item)
		if mediaCursorAfter(createdAt, id, cursor) {
			return index, nil
		}
	}
	return len(items), nil
}
