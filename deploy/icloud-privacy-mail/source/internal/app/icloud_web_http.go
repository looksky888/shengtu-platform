package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func (c *ICloudClient) call(ctx context.Context, session ICloudSession, method, path string, body any, result any) error {
	u, err := c.endpoint(session, path)
	if err != nil {
		return err
	}
	return c.callEnvelope(ctx, session, method, u, body, result)
}

func (c *ICloudClient) callEnvelope(ctx context.Context, session ICloudSession, method, rawURL string, body any, result any) error {
	if err := validateICloudWebRequestCookies(session, rawURL, time.Now()); err != nil {
		return err
	}
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return err
	}
	contentType := "text/plain;charset=UTF-8"
	if body == nil {
		contentType = ""
	}
	setICloudFetchHeaders(req, session, "application/json", contentType)
	webState, _ := iCloudWebLoginState(session)
	if cookie := cookieHeader(webState.Cookies, rawURL); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("icloud HTTP %d: %s", resp.StatusCode, trimForError(data))
	}
	var envelope struct {
		Success bool            `json:"success"`
		Result  json.RawMessage `json:"result"`
		Error   *struct {
			Code    string `json:"errorCode"`
			Message string `json:"errorMessage"`
		} `json:"error"`
		Timestamp int64 `json:"timestamp"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return errCode("icloud_bad_response", "iCloud 返回无法解析；原始返回："+trimForError(data), true)
	}
	if !envelope.Success {
		msg := "iCloud 接口返回失败"
		if envelope.Error != nil && strings.TrimSpace(envelope.Error.Message) != "" {
			msg = envelope.Error.Message
		}
		return iCloudAPIError(msg)
	}
	if result != nil {
		if err := json.Unmarshal(envelope.Result, result); err != nil {
			return errCode("icloud_bad_result", "iCloud 结果无法解析；原始返回："+trimForError(envelope.Result), true)
		}
	}
	return nil
}

func iCloudAPIError(message string) error {
	message = strings.TrimSpace(message)
	if message == "" {
		message = "iCloud 接口返回失败"
	}
	if isICloudHMELimitMessage(message) {
		return errCode("icloud_hme_limit", "iCloud 已达到当前隐私邮箱创建上限，请稍后再试；原始返回："+trimForError([]byte(message)), true)
	}
	return errCode("icloud_api_failed", message, true)
}

func isICloudHMELimitMessage(message string) bool {
	normalized := strings.ToLower(strings.TrimSpace(message))
	return strings.Contains(normalized, "reached the limit of addresses") ||
		(strings.Contains(normalized, "limit") && strings.Contains(normalized, "try again later")) ||
		strings.Contains(message, "创建上限")
}
