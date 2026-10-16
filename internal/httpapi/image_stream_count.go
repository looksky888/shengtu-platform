package httpapi

import (
	"crypto/sha256"

	"chatgpt2api/internal/util"
)

// Stream chunks can repeat final images. Keep only fingerprints, not copies
// of the potentially large base64 payloads, when counting inline results.
type inlineImageCounter map[[32]byte]struct{}

func (counter inlineImageCounter) observe(item map[string]any) {
	for _, row := range util.AsMapSlice(item["data"]) {
		if util.Clean(row["url"]) != "" {
			continue
		}
		if encoded := util.Clean(row["b64_json"]); encoded != "" {
			counter[sha256.Sum256([]byte(encoded))] = struct{}{}
		}
	}
}

func (counter inlineImageCounter) count(urls []string, hasData bool, billed int) int {
	count := len(dedupe(urls)) + len(counter)
	if count == 0 {
		count = countStreamImageResults(urls, hasData, billed)
	}
	if billed > 0 && count > billed {
		count = billed
	}
	return count
}
