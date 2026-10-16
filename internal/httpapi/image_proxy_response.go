package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
)

const (
	proxyJSONBodyLimit = 32 << 20
	proxyPreviewLimit  = 500
)

func readProxyJSONResponse(resp *http.Response) (map[string]any, error) {
	if resp == nil || resp.Body == nil {
		return nil, proxyInvalidJSONError(resp, nil)
	}
	raw, readErr := util.ReadAllLimited(resp.Body, proxyJSONBodyLimit)
	if readErr != nil {
		return nil, &protocol.ImageGenerationError{
			Message:    "读取中转站响应失败：" + readErr.Error(),
			StatusCode: http.StatusBadGateway,
			Type:       "server_error",
			Code:       "image_proxy_read_error",
		}
	}
	payload, decodeErr := decodeProxyJSON(raw)
	if decodeErr != nil {
		return nil, proxyInvalidJSONError(resp, raw)
	}
	return payload, nil
}

func decodeProxyJSON(raw []byte) (map[string]any, error) {
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil, err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("multiple JSON values")
		}
		return nil, err
	}
	return payload, nil
}

func proxyInvalidJSONError(resp *http.Response, raw []byte) error {
	err := &protocol.ImageGenerationError{
		Message:    fmt.Sprintf("中转站返回非 JSON：status=%s content_type=%s preview=%q", proxyResponseStatus(resp), proxyResponseHeader(resp, "Content-Type"), proxyBodyPreview(raw, proxyPreviewLimit)),
		StatusCode: proxyInvalidJSONStatusCode(resp),
		Type:       "server_error",
		Code:       proxyInvalidJSONCode(resp),
	}
	return imageErrorWithResponseMetadata(err, resp, nil)
}

func proxyInvalidJSONStatusCode(resp *http.Response) int {
	if resp == nil || resp.StatusCode == 0 {
		return http.StatusBadGateway
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return resp.StatusCode
	}
	return http.StatusBadGateway
}

func proxyInvalidJSONCode(resp *http.Response) string {
	if resp != nil && resp.StatusCode >= 500 {
		return fmt.Sprintf("image_proxy_http_%d_invalid_json", resp.StatusCode)
	}
	if resp != nil && resp.StatusCode == http.StatusTooManyRequests {
		return "image_proxy_http_429_invalid_json"
	}
	return "image_proxy_invalid_json"
}

func proxyResponseStatus(resp *http.Response) string {
	if resp == nil {
		return "unknown"
	}
	return resp.Status
}

func proxyResponseHeader(resp *http.Response, key string) string {
	if resp == nil {
		return ""
	}
	return resp.Header.Get(key)
}

func proxyBodyPreview(raw []byte, limit int) string {
	if len(raw) == 0 {
		return "<empty>"
	}
	text := string(raw)
	if !utf8.ValidString(text) {
		text = string(bytes.ToValidUTF8(raw, []byte{0xef, 0xbf, 0xbd}))
	}
	text = strings.Join(strings.Fields(text), " ")
	if len([]rune(text)) <= limit {
		return text
	}
	return string([]rune(text)[:limit]) + "..."
}
