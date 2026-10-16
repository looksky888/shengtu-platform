package service

import (
	"chatgpt2api/internal/util"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func registerMailRequestJSON(client *http.Client, method, target string, headers map[string]string, query map[string]string, payload any, expected ...int) (map[string]any, error) {
	data, err := registerMailRequestAny(client, method, target, headers, query, payload, expected...)
	if err != nil {
		return nil, err
	}
	return util.StringMap(data), nil
}

func registerMailRequestAny(client *http.Client, method, target string, headers map[string]string, query map[string]string, payload any, expected ...int) (any, error) {
	var bodyReader *strings.Reader
	if payload == nil {
		bodyReader = strings.NewReader("")
	} else {
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		bodyReader = strings.NewReader(string(data))
	}
	if len(query) > 0 {
		parsed, err := url.Parse(target)
		if err != nil {
			return nil, err
		}
		values := parsed.Query()
		for key, value := range query {
			if strings.TrimSpace(value) != "" {
				values.Set(key, value)
			}
		}
		parsed.RawQuery = values.Encode()
		target = parsed.String()
	}
	req, err := http.NewRequest(method, target, bodyReader)
	if err != nil {
		return nil, err
	}
	for key, value := range headers {
		if strings.TrimSpace(value) != "" {
			req.Header.Set(key, value)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if !registerExpectedStatus(resp.StatusCode, expected...) {
		return nil, fmt.Errorf("mail request failed: %s %s -> HTTP %d", method, target, resp.StatusCode)
	}
	if resp.StatusCode == http.StatusNoContent {
		return map[string]any{}, nil
	}
	var data any
	if err := util.DecodeJSON(resp.Body, &data); err != nil {
		return nil, err
	}
	return data, nil
}

func registerExpectedStatus(status int, expected ...int) bool {
	for _, item := range expected {
		if status == item {
			return true
		}
	}
	return false
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}
