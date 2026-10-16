package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/service"
)

func TestCreationTaskSubmitErrorsExposeStableCodes(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{name: "user concurrency", err: service.ImageTaskLimitError{Message: "用户并发限制已达到（最多 2 个任务处理中）"}, status: http.StatusTooManyRequests, code: "user_concurrency_limited"},
		{name: "user rpm", err: service.ImageTaskLimitError{Message: "用户 RPM 速率限制已达到（每分钟最多 2 次）"}, status: http.StatusTooManyRequests, code: "user_rpm_limited"},
		{name: "image queue", err: testError("图片任务队列已满，请稍后重试"), status: http.StatusTooManyRequests, code: "image_queue_full"},
		{name: "video queue", err: testError("视频任务队列已满，请稍后重试"), status: http.StatusTooManyRequests, code: "video_queue_full"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := httptest.NewRecorder()
			writeCreationTaskSubmitError(res, tc.err)
			var payload struct {
				Detail struct {
					Error struct {
						Code    string `json:"code"`
						Message string `json:"message"`
					} `json:"error"`
				} `json:"detail"`
			}
			if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
				t.Fatal(err)
			}
			if res.Code != tc.status || payload.Detail.Error.Code != tc.code || payload.Detail.Error.Message == "" {
				t.Fatalf("status=%d payload=%#v", res.Code, payload)
			}
		})
	}
}

type testError string

func (e testError) Error() string { return string(e) }
