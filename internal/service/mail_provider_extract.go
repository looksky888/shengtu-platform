package service

import (
	"chatgpt2api/internal/util"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"sort"
	"strings"
	"time"
)

func extractRegisterMailCode(message map[string]any) string {
	textContent, htmlContent := extractRegisterMailContent(message)
	content := strings.TrimSpace(strings.Join([]string{
		util.Clean(message["subject"]),
		textContent,
		htmlContent,
	}, "\n"))
	if content == "" {
		return ""
	}
	for _, pattern := range registerMailCodePatterns {
		match := pattern.FindStringSubmatch(content)
		if len(match) > 1 {
			code := strings.TrimSpace(match[1])
			if code != "" && code != "177010" {
				return code
			}
		}
	}
	return ""
}

func extractUnseenRegisterMailCode(mailbox map[string]any, message map[string]any) string {
	ref := registerMailMessageRef(message)
	seen := registerSeenMailRefs(mailbox["_seen_code_message_refs"])
	if ref != "" {
		if _, ok := seen[ref]; ok {
			return ""
		}
	}
	code := extractRegisterMailCode(message)
	if code == "" || ref == "" {
		return code
	}
	existing := registerSeenMailRefList(mailbox["_seen_code_message_refs"])
	mailbox["_seen_code_message_refs"] = append(existing, ref)
	return code
}

func registerSeenMailRefs(value any) map[string]struct{} {
	out := map[string]struct{}{}
	for _, item := range registerSeenMailRefList(value) {
		out[item] = struct{}{}
	}
	return out
}

func registerSeenMailRefList(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if ref := util.Clean(item); ref != "" {
				out = append(out, ref)
			}
		}
		return out
	default:
		return nil
	}
}

func registerMailMessageRef(message map[string]any) string {
	provider := util.Clean(message["provider"])
	mailbox := util.Clean(message["mailbox"])
	if id := registerMessageID(message); id != "" {
		return "id:" + provider + ":" + mailbox + ":" + id
	}
	textContent, htmlContent := extractRegisterMailContent(message)
	received := util.Clean(message["received_at"])
	content := strings.Join([]string{util.Clean(message["subject"]), textContent, htmlContent}, "\n")
	if strings.TrimSpace(content) == "" {
		return ""
	}
	sum := sha1.Sum([]byte(content))
	return fmt.Sprintf("content:%s:%s:%s:%x", provider, mailbox, received, sum[:8])
}

func extractRegisterMailContent(data map[string]any) (string, string) {
	textContent := firstNonEmpty(
		registerContentString(data["text_content"]),
		registerContentString(data["text"]),
		registerContentString(data["body"]),
		registerContentString(data["content"]),
	)
	htmlContent := firstNonEmpty(
		registerContentString(data["html_content"]),
		registerContentString(data["html"]),
		registerContentString(data["html_body"]),
		registerContentString(data["body_html"]),
	)
	if textContent != "" || htmlContent != "" {
		return textContent, htmlContent
	}
	raw, ok := data["raw"].(string)
	if !ok || strings.TrimSpace(raw) == "" {
		return "", ""
	}
	textContent, htmlContent = parseRegisterRawMail(raw)
	if textContent == "" && htmlContent == "" {
		return raw, ""
	}
	return textContent, htmlContent
}

func registerContentString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []string:
		return strings.TrimSpace(strings.Join(typed, ""))
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := registerContentString(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.TrimSpace(strings.Join(parts, ""))
	default:
		return util.Clean(value)
	}
}

func parseRegisterRawMail(raw string) (string, string) {
	message, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		return raw, ""
	}
	plain, html := parseRegisterMIMEBody(message.Header.Get("Content-Type"), message.Header.Get("Content-Transfer-Encoding"), message.Body)
	return strings.TrimSpace(strings.Join(plain, "\n")), strings.TrimSpace(strings.Join(html, "\n"))
}

func parseRegisterMIMEBody(contentType, transferEncoding string, body io.Reader) ([]string, []string) {
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.TrimSpace(strings.ToLower(strings.Split(contentType, ";")[0]))
	}
	if strings.HasPrefix(mediaType, "multipart/") {
		boundary := params["boundary"]
		if boundary == "" {
			return nil, nil
		}
		reader := multipart.NewReader(body, boundary)
		var plain []string
		var html []string
		for {
			part, partErr := reader.NextPart()
			if partErr == io.EOF {
				break
			}
			if partErr != nil {
				break
			}
			partPlain, partHTML := parseRegisterMIMEBody(part.Header.Get("Content-Type"), part.Header.Get("Content-Transfer-Encoding"), part)
			plain = append(plain, partPlain...)
			html = append(html, partHTML...)
		}
		return plain, html
	}
	payload, err := readRegisterMIMEPayload(body, transferEncoding)
	if err != nil || strings.TrimSpace(payload) == "" {
		return nil, nil
	}
	if mediaType == "text/html" {
		return nil, []string{payload}
	}
	if mediaType == "" || strings.HasPrefix(mediaType, "text/") {
		return []string{payload}, nil
	}
	return nil, nil
}

func readRegisterMIMEPayload(body io.Reader, transferEncoding string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(transferEncoding)) {
	case "base64":
		data, err := io.ReadAll(body)
		if err != nil {
			return "", err
		}
		cleaned := strings.NewReplacer("\r", "", "\n", "", " ", "", "\t", "").Replace(string(data))
		decoded, err := base64.StdEncoding.DecodeString(cleaned)
		if err != nil {
			return "", err
		}
		return string(decoded), nil
	case "quoted-printable":
		data, err := io.ReadAll(quotedprintable.NewReader(body))
		if err != nil {
			return "", err
		}
		return string(data), nil
	default:
		data, err := io.ReadAll(body)
		if err != nil {
			return "", err
		}
		return string(data), nil
	}
}

func registerMessageMatchesEmail(data map[string]any, email string) bool {
	target := strings.ToLower(strings.TrimSpace(email))
	if target == "" {
		return true
	}
	var candidates []string
	for _, key := range []string{"to", "mailTo", "receiver", "receivers", "address", "email", "envelope_to"} {
		if value, ok := data[key]; ok {
			candidates = append(candidates, registerTextCandidates(value)...)
		}
	}
	if len(candidates) == 0 {
		return true
	}
	for _, candidate := range candidates {
		if strings.Contains(strings.ToLower(strings.TrimSpace(candidate)), target) {
			return true
		}
	}
	return false
}

func registerTextCandidates(value any) []string {
	switch typed := value.(type) {
	case string:
		return []string{typed}
	case map[string]any:
		var out []string
		for _, key := range []string{"address", "email", "name", "value"} {
			if item, ok := typed[key]; ok {
				out = append(out, registerTextCandidates(item)...)
			}
		}
		return out
	case []any:
		var out []string
		for _, item := range typed {
			out = append(out, registerTextCandidates(item)...)
		}
		return out
	case []map[string]any:
		var out []string
		for _, item := range typed {
			out = append(out, registerTextCandidates(item)...)
		}
		return out
	default:
		return nil
	}
}

func latestRegisterMailMessage(items []map[string]any) map[string]any {
	if len(items) == 0 {
		return nil
	}
	candidates := append([]map[string]any(nil), items...)
	sort.SliceStable(candidates, func(i, j int) bool {
		left := registerMessageReceivedAt(candidates[i])
		right := registerMessageReceivedAt(candidates[j])
		if !left.IsZero() || !right.IsZero() {
			if !left.Equal(right) {
				return left.After(right)
			}
			return registerMessageID(candidates[i]) > registerMessageID(candidates[j])
		}
		return false
	})
	return candidates[0]
}

func registerMessageReceivedAt(data map[string]any) time.Time {
	for _, key := range []string{"created_at", "createdAt", "received_at", "receivedAt", "date", "timestamp"} {
		if value, ok := data[key]; ok {
			if parsed := parseRegisterMailTime(value); !parsed.IsZero() {
				return parsed
			}
		}
	}
	return time.Time{}
}

func registerMessageID(data map[string]any) string {
	return util.Clean(firstNonNil(data["id"], data["message_id"], data["_id"], data["token"], data["@id"]))
}

func parseRegisterMailTime(value any) time.Time {
	switch typed := value.(type) {
	case int:
		return time.Unix(int64(typed), 0).UTC()
	case int64:
		return time.Unix(typed, 0).UTC()
	case float64:
		return time.Unix(int64(typed), 0).UTC()
	case json.Number:
		if integer, err := typed.Int64(); err == nil {
			return time.Unix(integer, 0).UTC()
		}
		if number, err := typed.Float64(); err == nil {
			return time.Unix(int64(number), 0).UTC()
		}
	}
	text := util.Clean(value)
	if text == "" {
		return time.Time{}
	}
	if parsed, err := time.Parse(time.RFC3339Nano, text); err == nil {
		return parsed
	}
	if parsed, err := time.Parse(time.RFC1123Z, text); err == nil {
		return parsed
	}
	if parsed, err := time.Parse(time.RFC1123, text); err == nil {
		return parsed
	}
	if parsed, err := mail.ParseDate(text); err == nil {
		return parsed
	}
	return time.Time{}
}
