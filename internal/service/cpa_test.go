package service

import (
	"context"
	"strings"
	"testing"
)

func TestCPAListRemoteFilesRejectsMalformedBaseURL(t *testing.T) {
	service := &CPAImportService{}

	_, err := service.ListRemoteFiles(context.Background(), map[string]any{
		"base_url":   "http://example.test/%zz",
		"secret_key": "secret",
	})

	if err == nil || !strings.Contains(err.Error(), "CPA base_url 无效") {
		t.Fatalf("expected malformed base URL error, got %v", err)
	}
}

func TestCPAFetchRemoteAccessTokenRejectsMalformedBaseURL(t *testing.T) {
	service := &CPAImportService{}

	_, err := service.fetchRemoteAccessToken(context.Background(), map[string]any{
		"base_url":   "http://example.test/%zz",
		"secret_key": "secret",
	}, "account.json")

	if err == nil || !strings.Contains(err.Error(), "CPA base_url 无效") {
		t.Fatalf("expected malformed base URL error, got %v", err)
	}
}
