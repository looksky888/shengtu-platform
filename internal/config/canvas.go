package config

import (
	"fmt"
	"net/url"
	"strings"
)

func validateCanvasURL(value string) error {
	if value == "" {
		return nil
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed == nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.User != nil || strings.ContainsAny(value, "\\\r\n\t ") || len(value) > 2048 {
		return fmt.Errorf("无限画布地址须为不含账号密码的完整 HTTP/HTTPS 链接")
	}
	return nil
}

func normalizeCanvasUpdate(data map[string]any) error {
	raw, exists := data["canvas_url"]
	if !exists {
		return nil
	}
	value, ok := raw.(string)
	if !ok {
		return fmt.Errorf("无限画布地址必须是字符串，清空请填写空字符串")
	}
	value = strings.TrimSpace(value)
	if err := validateCanvasURL(value); err != nil {
		return err
	}
	data["canvas_url"] = value
	return nil
}

func (s *Store) CanvasURL() string {
	value, _ := s.settingValue("canvas_url", "").(string)
	value = strings.TrimSpace(value)
	if validateCanvasURL(value) != nil {
		return ""
	}
	return value
}
