//go:build windows

package updaterclient

import (
	"errors"
	"net/http"
)

func unixTransport(string) (http.RoundTripper, error) {
	return nil, errors.New("Windows 本地开发请配置 CHATGPT2API_HOST_UPDATER_URL=http://127.0.0.1:18081")
}
