package backend

import (
	"context"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func decodeImageReference(value string) ([]byte, error) {
	// Only accept data URLs / base64 payloads. Never treat arbitrary short strings
	// as local filesystem paths (prevents LFI via image edit / multimodal upload).
	return util.B64Decode(value)
}

func extractImageToolRecords(data map[string]any) ([]string, []string) {
	mapping := util.StringMap(data["mapping"])
	type record struct {
		createTime float64
		files      []string
		sediments  []string
	}
	var records []record
	for _, rawNode := range mapping {
		node := util.StringMap(rawNode)
		message := util.StringMap(node["message"])
		author := util.StringMap(message["author"])
		metadata := util.StringMap(message["metadata"])
		content := util.StringMap(message["content"])
		role := strings.ToLower(util.Clean(author["role"]))
		isImageGen := util.Clean(metadata["async_task_type"]) == "image_gen"
		hasAssetPointer := hasImageAssetPointer(content) || hasImageAssetPointer(metadata)
		if role != "tool" && role != "assistant" {
			continue
		}
		if role == "assistant" && !hasAssetPointer {
			continue
		}
		var files, sediments []string
		if role == "assistant" {
			// Images 2.5 may publish the generated asset as an assistant
			// image_asset_pointer without async_task_type=image_gen.
			files, sediments = extractImageAssetPointerIDs(map[string]any{"content": content, "metadata": metadata})
		} else {
			files, sediments = extractImageReferenceIDs(map[string]any{"content": content, "metadata": metadata})
		}
		if len(files) == 0 && len(sediments) == 0 {
			if !isImageGen && !hasAssetPointer {
				continue
			}
			continue
		}
		records = append(records, record{createTime: floatValue(message["create_time"]), files: files, sediments: sediments})
	}
	sort.Slice(records, func(i, j int) bool { return records[i].createTime < records[j].createTime })
	var files, sediments []string
	for _, rec := range records {
		files = appendUnique(files, rec.files...)
		sediments = appendUnique(sediments, rec.sediments...)
	}
	return files, sediments
}

func hasImageAssetPointer(value any) bool {
	switch item := value.(type) {
	case map[string]any:
		if util.Clean(item["content_type"]) == "image_asset_pointer" {
			return true
		}
		pointer := util.Clean(item["asset_pointer"])
		if strings.HasPrefix(pointer, "file-service://") || strings.HasPrefix(pointer, "sediment://") {
			return true
		}
		for _, nested := range item {
			if hasImageAssetPointer(nested) {
				return true
			}
		}
	case []any:
		for _, nested := range item {
			if hasImageAssetPointer(nested) {
				return true
			}
		}
	}
	return false
}

func extractImageAssetPointerIDs(value any) ([]string, []string) {
	var files, sediments []string
	var walk func(any)
	walk = func(item any) {
		switch value := item.(type) {
		case map[string]any:
			if pointer := util.Clean(value["asset_pointer"]); pointer != "" {
				candidateFiles, candidateSediments := extractImageReferenceIDs(pointer)
				files = appendUnique(files, candidateFiles...)
				sediments = appendUnique(sediments, candidateSediments...)
			}
			for _, nested := range value {
				if _, ok := nested.(map[string]any); ok {
					walk(nested)
				} else if _, ok := nested.([]any); ok {
					walk(nested)
				}
			}
		case []any:
			for _, nested := range value {
				walk(nested)
			}
		}
	}
	walk(value)
	return files, sediments
}

var (
	fileServiceIDRE   = regexp.MustCompile(`file-service://([A-Za-z0-9_-]+)`)
	realImageFileIDRE = regexp.MustCompile(`\bfile_00000000[a-f0-9]{24}\b`)
	sedimentIDRE      = regexp.MustCompile(`sediment://([A-Za-z0-9_-]+)`)
)

func extractImageReferenceIDs(value any) ([]string, []string) {
	var files, sediments []string
	var walk func(any)
	walk = func(v any) {
		switch x := v.(type) {
		case string:
			for _, hit := range fileServiceIDRE.FindAllStringSubmatch(x, -1) {
				if len(hit) > 1 {
					files = appendUnique(files, hit[1])
				}
			}
			files = appendUnique(files, realImageFileIDRE.FindAllString(x, -1)...)
			for _, hit := range sedimentIDRE.FindAllStringSubmatch(x, -1) {
				if len(hit) > 1 {
					sediments = appendUnique(sediments, hit[1])
				}
			}
		case map[string]any:
			for _, item := range x {
				walk(item)
			}
		case []any:
			for _, item := range x {
				walk(item)
			}
		}
	}
	walk(value)
	return files, sediments
}

func anySlice(value any) []any {
	if list, ok := value.([]any); ok {
		return list
	}
	return nil
}

func contains(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func appendUnique(base []string, values ...string) []string {
	seen := map[string]struct{}{}
	for _, item := range base {
		seen[item] = struct{}{}
	}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		base = append(base, value)
	}
	return base
}

func filter(values []string, keep func(string) bool) []string {
	out := values[:0]
	for _, value := range values {
		if keep(value) {
			out = append(out, value)
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func imageUploadSettleDelay() time.Duration {
	// Default 200ms (was fixed 500ms). Override with CHATGPT2API_IMAGE_UPLOAD_SETTLE_MS (milliseconds).
	raw := strings.TrimSpace(os.Getenv("CHATGPT2API_IMAGE_UPLOAD_SETTLE_MS"))
	if raw == "" {
		return 200 * time.Millisecond
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value < 0 {
		return 200 * time.Millisecond
	}
	duration := time.Duration(value * float64(time.Millisecond))
	if duration > 5*time.Second {
		return 5 * time.Second
	}
	return duration
}

func imagePollTimeout() time.Duration {
	return envDurationSeconds("CHATGPT2API_IMAGE_POLL_TIMEOUT_SECONDS", 60*time.Second, time.Second, 3600*time.Second)
}

// ImagePollTimeout exposes the configured async image-result recovery budget to
// the protocol layer without duplicating environment parsing there.
func ImagePollTimeout() time.Duration {
	return imagePollTimeout()
}

func imagePollInterval() time.Duration {
	return envDurationSeconds("CHATGPT2API_IMAGE_POLL_INTERVAL_SECONDS", 5*time.Second, 500*time.Millisecond, 60*time.Second)
}

func imagePollInitialWait() time.Duration {
	return envDurationSeconds("CHATGPT2API_IMAGE_POLL_INITIAL_WAIT_SECONDS", 5*time.Second, 0, 120*time.Second)
}

func envDurationSeconds(key string, fallback, minValue, maxValue time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	duration := time.Duration(value * float64(time.Second))
	if duration < minValue {
		return minValue
	}
	if maxValue > 0 && duration > maxValue {
		return maxValue
	}
	return duration
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

func sleepWithinContext(ctx context.Context, duration time.Duration) bool {
	if duration <= 0 {
		return ctx.Err() == nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func isTransientPollError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "status=429") ||
		strings.Contains(text, "status=500") ||
		strings.Contains(text, "status=502") ||
		strings.Contains(text, "status=503") ||
		strings.Contains(text, "status=504") ||
		strings.Contains(text, "timeout") ||
		strings.Contains(text, "connection") ||
		strings.Contains(text, "stream") ||
		strings.Contains(text, "reset by peer") ||
		strings.Contains(text, "unexpected eof")
}

func floatValue(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	default:
		return 0
	}
}
