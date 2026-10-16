package app

import (
	"bytes"
	"encoding/json"
	"strings"
)

func trimForError(data []byte) string {
	text := strings.TrimSpace(string(data))
	if len(text) > 240 {
		return text[:240] + "..."
	}
	return text
}

func appleDebugBody(data []byte) string {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return ""
	}
	var value any
	if err := json.Unmarshal(trimmed, &value); err == nil {
		redacted := redactAppleDebugJSON(value)
		var buf bytes.Buffer
		encoder := json.NewEncoder(&buf)
		encoder.SetEscapeHTML(false)
		if err := encoder.Encode(redacted); err == nil {
			return trimForError(bytes.TrimSpace(buf.Bytes()))
		}
	}
	return trimForError(trimmed)
}

func redactAppleDebugJSON(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			if appleDebugSecretKey(key) {
				out[key] = "<redacted>"
				continue
			}
			out[key] = redactAppleDebugJSON(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = redactAppleDebugJSON(item)
		}
		return out
	default:
		return value
	}
}

func appleDebugSecretKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	for _, marker := range []string{"apikey", "api_key", "token", "secret", "password", "scnt", "session", "email", "accountname", "appleid", "dsid"} {
		if strings.Contains(key, marker) {
			return true
		}
	}
	return false
}
