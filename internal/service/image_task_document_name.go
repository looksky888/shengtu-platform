package service

import (
	"crypto/sha256"
	"fmt"
	"strings"
)

func taskEntryDocName(ownerID, id string) string {
	return "image_tasks/items/" + taskDocumentPart(ownerID) + "/" + taskDocumentPart(id) + ".json"
}

func taskDocumentPart(value string) string {
	trimmed := strings.TrimSpace(value)
	hash := sha256.Sum256([]byte(trimmed))
	return fmt.Sprintf("%x", hash)
}

func legacyTaskEntryDocName(ownerID, id string) string {
	return "image_tasks/items/" + legacyTaskDocumentPart(ownerID) + "/" + legacyTaskDocumentPart(id) + ".json"
}

func legacyTaskDocumentPart(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "x"
	}
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	if b.Len() == 0 {
		return "x"
	}
	return b.String()
}
