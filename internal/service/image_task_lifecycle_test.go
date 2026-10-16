package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestImageTaskServiceCancelsQueuedTask(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	started := make(chan string, 2)
	release := make(chan struct{})
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		started <- payload["prompt"].(string)
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 }, func() int { return 1 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "first", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(first) error = %v", err)
	}
	if got := waitForStartedTask(t, started); got != "first" {
		t.Fatalf("started task = %q, want first", got)
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-2", "second", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(second) error = %v", err)
	}

	cancelled, err := svc.CancelTask(identity, "task-2")
	if err != nil {
		t.Fatalf("CancelTask() error = %v", err)
	}
	if cancelled["status"] != TaskStatusCancelled {
		t.Fatalf("cancelled task status = %#v", cancelled)
	}
	close(release)
	waitForTaskStatus(t, svc, identity, "task-1", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "task-2", TaskStatusCancelled)
	select {
	case prompt := <-started:
		t.Fatalf("cancelled queued task still started: %s", prompt)
	default:
	}
}

func TestImageTaskServiceCancelsRunningTask(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	started := make(chan struct{})
	handlerDone := make(chan error, 1)
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		close(started)
		<-ctx.Done()
		handlerDone <- ctx.Err()
		return nil, ctx.Err()
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for task handler to start")
	}

	cancelled, err := svc.CancelTask(identity, "task-1")
	if err != nil {
		t.Fatalf("CancelTask() error = %v", err)
	}
	if cancelled["status"] != TaskStatusCancelled {
		t.Fatalf("cancelled task status = %#v", cancelled)
	}
	select {
	case err := <-handlerDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("handler ctx err = %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("task handler did not observe cancellation")
	}
	waitForTaskStatus(t, svc, identity, "task-1", TaskStatusCancelled)
}

func TestImageTaskServicePreservesPartialDataOnFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/first.png"}}}, errors.New("second image failed")
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 2, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}
	waitForTaskStatus(t, svc, identity, "task-1", TaskStatusError)
	got := svc.ListTasks(identity, []string{"task-1"})
	item := got["items"].([]map[string]any)[0]
	data := item["data"].([]map[string]any)
	if len(data) != 1 || data[0]["url"] != "https://example.test/first.png" {
		t.Fatalf("partial data was not preserved: %#v", item)
	}
	if item["error"] != "second image failed" {
		t.Fatalf("partial failure error = %#v", item)
	}
}

func TestImageTaskServiceMarksTimedOutTaskAsError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 })
	svc.SetTaskTimeoutGetter(func() time.Duration { return 20 * time.Millisecond })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}
	waitForTaskStatus(t, svc, identity, "task-1", TaskStatusError)
	got := svc.ListTasks(identity, []string{"task-1"})
	item := got["items"].([]map[string]any)[0]
	if item["error_code"] != "upstream_timeout" {
		t.Fatalf("timeout error = %#v", item)
	}
}

func TestImageTaskServicePreservesTextOutputType(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		return map[string]any{"message": "text response", "output_type": "text"}, nil
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "who are you", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}
	waitForTaskStatus(t, svc, identity, "task-1", TaskStatusSuccess)
	got := svc.ListTasks(identity, []string{"task-1"})
	item := got["items"].([]map[string]any)[0]
	if item["output_type"] != "text" {
		t.Fatalf("output_type = %#v, want text in %#v", item["output_type"], item)
	}
	data := item["data"].([]map[string]any)
	if len(data) != 1 || data[0]["text_response"] != "text response" {
		t.Fatalf("text response data = %#v", data)
	}
}

func TestResponseImageTaskRejectsTextFallbackOutput(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		return map[string]any{"message": "text fallback", "output_type": "text"}, nil
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 })
	svc.SetResponseImageHandler(handler)
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitResponseImageGeneration(context.Background(), identity, "response-1", "生成 2k 海报", "gpt-image-2", "2048x2048", "high", "https://base.test", nil, 1, nil); err != nil {
		t.Fatalf("SubmitResponseImageGeneration() error = %v", err)
	}
	waitForTaskStatus(t, svc, identity, "response-1", TaskStatusError)
	got := svc.ListTasks(identity, []string{"response-1"})
	item := got["items"].([]map[string]any)[0]
	if item["output_type"] != "text" {
		t.Fatalf("output_type = %#v, want text in %#v", item["output_type"], item)
	}
	if item["error"] != "text fallback" {
		t.Fatalf("error = %#v, want text fallback in %#v", item["error"], item)
	}
	if n := imageTaskDataLen(item["data"]); n != 0 {
		t.Fatalf("unexpected fallback data = %#v", item["data"])
	}
}

func imageTaskDataLen(data any) int {
	switch v := data.(type) {
	case nil:
		return 0
	case []any:
		return len(v)
	case []map[string]any:
		return len(v)
	default:
		return -1
	}
}

func TestImageTaskServiceRestoresUnfinishedTasksAsErrors(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	raw := map[string]any{"tasks": []map[string]any{
		{"id": "queued", "owner_id": "alice", "status": TaskStatusQueued, "mode": "generate", "created_at": "2026-01-01 00:00:00", "updated_at": "2026-01-01 00:00:00"},
		{"id": "running", "owner_id": "alice", "status": TaskStatusRunning, "mode": "edit", "created_at": "2026-01-01 00:00:00", "updated_at": "2026-01-01 00:00:00"},
	}}
	data, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	svc := NewImageTaskService(path, failingImageTaskHandler, failingImageTaskHandler, failingImageTaskHandler, func() int { return 30 })
	got := svc.ListTasks(Identity{ID: "alice"}, []string{"queued", "running"})
	items := got["items"].([]map[string]any)
	if len(items) != 2 {
		t.Fatalf("items = %#v", items)
	}
	for _, item := range items {
		if item["status"] != TaskStatusError {
			t.Fatalf("unfinished task was not restored as error: %#v", item)
		}
		if item["error"] == nil {
			t.Fatalf("restored task missing error text: %#v", item)
		}
	}
}

func waitForStartedTask(t *testing.T, started <-chan string) string {
	t.Helper()
	select {
	case prompt := <-started:
		return prompt
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for task handler to start")
	}
	return ""
}

func failingImageTaskHandler(context.Context, Identity, map[string]any) (map[string]any, error) {
	return nil, errors.New("unexpected handler call")
}

func waitForTaskStatus(t *testing.T, svc *ImageTaskService, identity Identity, taskID, want string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		got := svc.ListTasks(identity, []string{taskID})
		items := got["items"].([]map[string]any)
		if len(items) == 1 && items[0]["status"] == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("task %s did not reach status %s", taskID, want)
}

func TestClassifyImageTaskErrorChineseMessages(t *testing.T) {
	cases := []struct {
		name string
		err  error
		code string
		want string
	}{
		{name: "safety", err: fmt.Errorf("upstream policy refusal: not allowed request_id=req_safe"), code: "upstream_safety_rejected", want: "内容安全政策"},
		{name: "content-policies-plural", err: fmt.Errorf("We're so sorry, but the prompt may violate our content policies. If you think we got it wrong, please retry or edit your prompt."), code: "upstream_safety_rejected", want: "内容安全政策"},
		{name: "timeout", err: fmt.Errorf("context deadline exceeded"), code: "upstream_timeout", want: "\u8d85\u65f6"},
		{name: "cloudflare-524", err: fmt.Errorf(`中转站返回非 JSON：status=524 <none> content_type=text/plain; charset=UTF-8 preview="error code: 524"`), code: "upstream_timeout", want: "\u8d85\u65f6"},
		{name: "gateway-502", err: fmt.Errorf(`中转站返回非 JSON：status=502 Bad Gateway content_type=text/plain; charset=UTF-8 preview="error code: 502"`), code: "upstream_gateway_error", want: "网关异常"},
		{name: "credits", err: ErrInsufficientCredits, code: "insufficient_credits", want: "积分不足"},
		{name: "quota", err: fmt.Errorf("no available image quota"), code: "no_available_image_quota", want: "没有可用图片额度"},
		{name: "slot-busy", err: fmt.Errorf("no available image account slot"), code: "account_pool_slot_busy", want: "并发槽"},
		{name: "gpt-pool-empty", err: fmt.Errorf("GPT 号池为空：请先注册或导入 ChatGPT 账号，或改用 Grok 模型（grok-imagine-image）生图"), code: "gpt_account_pool_empty", want: "GPT 号池为空"},
		{name: "usage-limit", err: fmt.Errorf("Image generation failed: Usage limit reached"), code: "upstream_usage_limit", want: "用量上限"},
		{name: "rate-limit", err: fmt.Errorf("Upstream rate limit exceeded, please retry later"), code: "upstream_rate_limited", want: "速率限制"},
		{name: "text", err: fmt.Errorf("text instead of image"), code: "image_generation_text_response", want: "\u8fd4\u56de\u4e86\u6587\u672c\u800c\u4e0d\u662f\u56fe\u7247"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyImageTaskError(tc.err)
			if got.Code != tc.code {
				t.Fatalf("code = %q, want %q", got.Code, tc.code)
			}
			if !strings.Contains(got.Message, tc.want) {
				t.Fatalf("message = %q, want contains %q", got.Message, tc.want)
			}
		})
	}
}

func TestExtractUpstreamRequestID(t *testing.T) {
	got := extractUpstreamRequestID("upstream failed request_id=req_123, please retry")
	if got != "req_123" {
		t.Fatalf("request id = %q", got)
	}
}
