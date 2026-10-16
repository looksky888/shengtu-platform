package protocol

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func imageAttemptID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	value, _ := ctx.Value(imageAttemptContextKey{}).(string)
	return value
}

func shortEvidenceHash(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])[:16]
}

func shortEvidenceHashes(values []string) []string {
	hashes := make([]string, 0, len(values))
	for _, value := range values {
		if hash := shortEvidenceHash(value); hash != "" {
			hashes = append(hashes, hash)
		}
	}
	return hashes
}
