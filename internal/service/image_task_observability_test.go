package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestImageTaskObservabilityPersistsRouteAndUpstreamEvidence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	handler := func(ctx context.Context, _ Identity, _ map[string]any) (map[string]any, error) {
		ReportTaskEvent(ctx, "upstream_attempt_failed", "upstream failed", map[string]any{
			"effective_provider":   ImageTaskProviderAccountPool,
			"effective_channel":    ImageTaskChannelAccountPool,
			"effective_model":      "gpt-image-2",
			"upstream_host":        "chatgpt.com",
			"upstream_http_status": 502,
			"upstream_request_id":  "req-123",
			"upstream_cf_ray":      "ray-123",
			"retry_index":          2,
			"attempt_count":        3,
		})
		return nil, errors.New("upstream failed: status=502 upstream_host=chatgpt.com request_id=req-123 cf-ray=ray-123")
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 3 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}
	metadata := map[string]any{
		"effective_provider": ImageTaskProviderAccountPool,
		"effective_channel":  ImageTaskChannelAccountPool,
		"provider_source":    "env_file",
		"effective_model":    "gpt-image-2",
		"upstream_host":      "chatgpt.com",
	}
	if _, err := svc.SubmitGenerationWithMetadata(context.Background(), identity, "obs-1", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil, metadata); err != nil {
		t.Fatalf("SubmitGenerationWithMetadata() error = %v", err)
	}
	waitForTaskStatus(t, svc, identity, "obs-1", TaskStatusError)
	item := svc.ListTasks(identity, []string{"obs-1"})["items"].([]map[string]any)[0]
	for key, want := range map[string]any{
		"effective_provider":   ImageTaskProviderAccountPool,
		"effective_channel":    ImageTaskChannelAccountPool,
		"provider_source":      "env_file",
		"effective_model":      "gpt-image-2",
		"upstream_host":        "chatgpt.com",
		"upstream_http_status": 502,
		"upstream_request_id":  "req-123",
		"upstream_cf_ray":      "ray-123",
		"retry_index":          2,
		"attempt_count":        3,
	} {
		if item[key] != want {
			t.Fatalf("%s = %#v, want %#v; item=%#v", key, item[key], want, item)
		}
	}

	reloaded := NewImageTaskService(path, handler, handler, handler, func() int { return 3 })
	reloadedItem := reloaded.ListTasks(identity, []string{"obs-1"})["items"].([]map[string]any)[0]
	if reloadedItem["upstream_request_id"] != "req-123" || reloadedItem["upstream_http_status"] != 502 {
		t.Fatalf("reloaded observability fields = %#v", reloadedItem)
	}
}

func TestExtractUpstreamEvidenceFromErrorText(t *testing.T) {
	metadata := ImageTaskUpstreamMetadataFromError(errors.New("status=504 upstream_host=https://api.example.test/v1 request_id=req-9 cf-ray=ray-9 retry=1 attempt=2"))
	if metadata.HTTPStatus != 504 || metadata.UpstreamHost != "api.example.test" {
		t.Fatalf("metadata status/host = %#v", metadata)
	}
	if metadata.RequestID != "req-9" || metadata.CFRay != "ray-9" {
		t.Fatalf("metadata IDs = %#v", metadata)
	}
	if metadata.RetryIndex != 1 || metadata.AttemptCount != 2 {
		t.Fatalf("metadata retry evidence = %#v", metadata)
	}
}

func TestImageTaskObservabilityReplacesAttemptScopedEvidence(t *testing.T) {
	task := &ImageTask{}
	task.applyObservabilityUpdates(map[string]any{
		"stage":                "upstream_attempt_failed",
		"upstream_http_status": 502,
		"upstream_request_id":  "req-old",
		"upstream_cf_ray":      "ray-old",
		"retry_index":          0,
		"attempt_count":        1,
	})
	task.applyObservabilityUpdates(map[string]any{
		"stage":                "upstream_attempt_failed",
		"upstream_http_status": 503,
		"retry_index":          1,
		"attempt_count":        2,
	})

	if task.UpstreamHTTPStatus != 503 || task.UpstreamRequestID != "" || task.UpstreamCFRay != "" {
		t.Fatalf("latest attempt evidence = %#v", task)
	}
	if task.RetryIndex != 1 || task.AttemptCount != 2 {
		t.Fatalf("latest retry evidence = retry %d attempt %d", task.RetryIndex, task.AttemptCount)
	}
}
