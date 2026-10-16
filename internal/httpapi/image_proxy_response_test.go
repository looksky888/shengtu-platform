package httpapi

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestDecodeProxyJSONRejectsTrailingValue(t *testing.T) {
	if _, err := decodeProxyJSON([]byte(`{"ok":true}{"extra":true}`)); err == nil {
		t.Fatal("expected trailing JSON value to be rejected")
	}
}

func TestReadProxyJSONResponseRejectsOversizedBody(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(strings.Repeat("x", proxyJSONBodyLimit+1))),
	}
	if _, err := readProxyJSONResponse(resp); err == nil {
		t.Fatal("expected oversized proxy response to be rejected")
	}
}
