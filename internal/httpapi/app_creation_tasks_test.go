package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestCreationTaskFailureWritesCallLog(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"task-log-test","prompt":"test image"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit creation task status = %d body = %s", res.Code, res.Body.String())
	}

	var logs map[string]any
	var item map[string]any
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		req = httptest.NewRequest(http.MethodGet, "/api/logs", nil)
		req.Header.Set("Authorization", adminAuthHeader(t, app))
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("logs status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &logs); err != nil {
			t.Fatalf("logs json: %v", err)
		}
		item = findLogBySummary(logItems(logs), "文生图调用失败")
		if item != nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if item == nil {
		t.Fatalf("expected creation task failure to write a log event, got %#v", logs)
	}
	if _, ok := item["type"]; ok {
		t.Fatalf("log item should not expose type: %#v", item)
	}
	detail, _ := item["detail"].(map[string]any)
	if detail["endpoint"] != "/api/creation-tasks/image-generations" ||
		detail["path"] != "/api/creation-tasks/image-generations" ||
		detail["method"] != http.MethodPost ||
		detail["module"] != "creation-tasks" ||
		detail["outcome"] != "failed" {
		t.Fatalf("unexpected log detail: %#v", detail)
	}
	if _, ok := detail["status"].(float64); !ok {
		t.Fatalf("log status should use numeric HTTP-style status: %#v", detail)
	}
	if detail["key_name"] != "frontend" || detail["key_role"] != "user" {
		t.Fatalf("call log did not include user key identity: %#v", detail)
	}
}

func TestResponsesImageTaskRouteBuildsTaskPayload(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	called := make(chan map[string]any, 1)
	app.tasks.SetResponseImageHandler(func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
		called <- payload
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/generated.png"}}}, nil
	})
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	body := `{"client_task_id":"response-image-route","prompt":"生成封面","model":"gpt-5.5","size":"1536x1024","image_resolution":"1k","quality":"high","output_format":"jpeg","output_compression":42,"n":2,"images":["data:image/png;base64,cG5n"],"messages":[{"role":"user","content":"生成封面"}],"visibility":"public"}`
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/response-image-generations", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit response image task status = %d body = %s", res.Code, res.Body.String())
	}
	var task map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &task); err != nil {
		t.Fatalf("task json: %v", err)
	}
	if task["mode"] != "response-image" || task["model"] != "gpt-5.5" || task["quality"] != "high" || task["visibility"] != "public" {
		t.Fatalf("unexpected submitted task = %#v", task)
	}
	if task["output_format"] != "jpeg" || util.ToInt(task["output_compression"], -1) != 42 {
		t.Fatalf("unexpected task output options = %#v", task)
	}
	select {
	case payload := <-called:
		if payload["model"] != "gpt-5.5" || payload["quality"] != "high" {
			t.Fatalf("unexpected response image payload = %#v", payload)
		}
		if payload["output_format"] != "jpeg" || util.ToInt(payload["output_compression"], -1) != 42 {
			t.Fatalf("unexpected response image output options = %#v", payload)
		}
		if images, ok := payload["images"].([]any); !ok || len(images) != 1 {
			t.Fatalf("payload images = %#v", payload["images"])
		}
		if payload["image_resolution"] != "1k" || payload["requested_size"] != "1536x1024" {
			t.Fatalf("payload request metadata = %#v", payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for response image handler")
	}
}

func TestResponsesImageTaskResultExtractsImagesAndText(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	imageData := "cG5n"
	completed := map[string]any{
		"created_at": float64(1700000000),
		"output": []map[string]any{
			{"type": "image_generation_call", "result": imageData, "revised_prompt": "封面"},
		},
	}
	result := responsesImageTaskResult(app.engine, completed, map[string]any{
		"prompt":          "生成封面",
		"response_format": "b64_json",
		"base_url":        "https://example.test",
		"owner_id":        "owner-1",
		"owner_name":      "Alice",
	})
	data := util.AsMapSlice(result["data"])
	if len(data) != 1 || data[0]["b64_json"] != imageData || data[0]["revised_prompt"] != "封面" {
		t.Fatalf("response image result data = %#v", result)
	}
	if urlValue := util.Clean(data[0]["url"]); !strings.HasPrefix(urlValue, "https://example.test/images/") {
		t.Fatalf("stored image url = %#v in %#v", urlValue, result)
	}

	text := responseOutputText([]map[string]any{
		{"type": "message", "content": []map[string]any{{"type": "output_text", "text": "模型返回文本"}}},
	})
	if text != "模型返回文本" {
		t.Fatalf("responseOutputText() = %q", text)
	}
}

func TestRunLoggedImageTaskLogsTextOutputAsFailure(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	identity := service.Identity{ID: "admin", Role: service.AuthRoleAdmin, Name: "Admin"}
	if _, _, err := app.credits.Add(identity.ID, 10, "test", "seed"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	result, err := app.runLoggedImageTask(
		context.Background(),
		identity,
		map[string]any{"model": "gpt-image-2"},
		"/api/creation-tasks/response-image-generations",
		"Responses 作画",
		func(context.Context, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "message": "模型返回文本", "data": []map[string]any{}}, nil
		},
	)
	if err != nil {
		t.Fatalf("runLoggedImageTask() error = %v", err)
	}
	if result["output_type"] != "text" || result["message"] != "模型返回文本" {
		t.Fatalf("runLoggedImageTask() result = %#v", result)
	}
	logs := app.logs.Search(service.LogQuery{Limit: 10})
	item := findLogBySummary(logs, "Responses 作画调用失败")
	if item == nil {
		t.Fatalf("expected text-only image result to write failure log, got %#v", logs)
	}
	detail := util.StringMap(item["detail"])
	if detail["outcome"] != "failed" || util.ToInt(detail["status"], 0) != http.StatusBadGateway {
		t.Fatalf("failure log detail = %#v", detail)
	}
}

func TestResponsesImageTaskTextOutputError(t *testing.T) {
	result := map[string]any{"data": []map[string]any{}}
	completed := map[string]any{
		"output": []map[string]any{
			{"type": "message", "content": []map[string]any{{"type": "output_text", "text": "Got it! What image would you like me to generate?"}}},
		},
	}
	err := responsesImageTaskTextOutputError(result, completed)
	if err == nil {
		t.Fatalf("responsesImageTaskTextOutputError() err = nil, result = %#v", result)
	}
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) || imageErr.Code != "image_generation_text_response" {
		t.Fatalf("err = %T %v, want image_generation_text_response", err, err)
	}
	if result["output_type"] != "text" {
		t.Fatalf("result output_type = %#v, want text in %#v", result["output_type"], result)
	}
}

func TestResponseImageTaskBodyPassesSizeToImageTool(t *testing.T) {
	body := responseImageTaskBody(map[string]any{
		"prompt":             "生成 4K 正方形封面",
		"model":              "gpt-5.5",
		"size":               "2880x2880",
		"quality":            "high",
		"output_format":      "webp",
		"output_compression": 35,
	})
	tools := body["tools"].([]map[string]any)
	if len(tools) != 1 {
		t.Fatalf("tools = %#v", body["tools"])
	}
	tool := tools[0]
	if tool["size"] != "2880x2880" {
		t.Fatalf("tool size = %#v, want 2880x2880", tool["size"])
	}
	if tool["quality"] != "high" {
		t.Fatalf("tool quality = %#v, want high", tool["quality"])
	}
	if tool["output_format"] != "webp" {
		t.Fatalf("tool output_format = %#v, want webp", tool["output_format"])
	}
	if tool["output_compression"] != 35 {
		t.Fatalf("tool output_compression = %#v, want 35", tool["output_compression"])
	}
}

func TestResponseImageTaskBodyConvertsAspectRatioSizeToDimensions(t *testing.T) {
	body := responseImageTaskBody(map[string]any{
		"prompt": "生成竖版封面",
		"model":  util.ImageModelGPT,
		"size":   "9:16",
	})
	tools := body["tools"].([]map[string]any)
	if len(tools) != 1 {
		t.Fatalf("tools = %#v", body["tools"])
	}
	tool := tools[0]
	if tool["size"] != "1024x1824" {
		t.Fatalf("tool size = %#v, want 1024x1824", tool["size"])
	}
}

func TestResponseImageTaskBodyOmitsPngCompression(t *testing.T) {
	body := responseImageTaskBody(map[string]any{
		"prompt":             "生成封面",
		"model":              "gpt-5.5",
		"output_format":      "png",
		"output_compression": 35,
	})
	tools := body["tools"].([]map[string]any)
	tool := tools[0]
	if tool["output_format"] != "png" {
		t.Fatalf("tool output_format = %#v, want png", tool["output_format"])
	}
	if _, ok := tool["output_compression"]; ok {
		t.Fatalf("png tool should omit output_compression: %#v", tool)
	}
}

func TestResponseImageTaskBodyDefaultsAutoSize(t *testing.T) {
	body := responseImageTaskBody(map[string]any{
		"prompt":  "生成封面",
		"model":   "gpt-5.5",
		"quality": "high",
	})
	tools := body["tools"].([]map[string]any)
	tool := tools[0]
	if tool["size"] != "auto" {
		t.Fatalf("tool size = %#v, want auto", tool["size"])
	}
	if tool["quality"] != "high" {
		t.Fatalf("tool quality = %#v, want high", tool["quality"])
	}
}
