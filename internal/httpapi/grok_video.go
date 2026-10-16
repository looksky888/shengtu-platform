package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const maxVideoContentBytes = 256 << 20

type grokVideoJob struct {
	ID       string         `json:"id"`
	Status   string         `json:"status"`
	Progress int            `json:"progress"`
	Error    map[string]any `json:"error"`
}

func (a *App) runGrokNativeVideoGeneration(ctx context.Context, payload map[string]any) (map[string]any, error) {
	if a == nil || a.config == nil {
		return nil, fmt.Errorf("config unavailable")
	}
	base := strings.TrimRight(a.config.GrokRuntimeBaseURL(), "/")
	if base == "" {
		return nil, videoRuntimeError(http.StatusBadRequest, "grok_native_not_configured", "GROK_RUNTIME_BASE_URL 未配置")
	}

	runtimePayload, err := a.resolveVideoInputPayload(payload)
	if err != nil {
		return nil, err
	}
	created, err := createGrokVideoJob(ctx, base, a.config.InternalServiceToken(), runtimePayload)
	if err != nil {
		return nil, err
	}
	service.ReportTaskEvent(ctx, "video_submitted", "Grok 视频任务已提交", map[string]any{"upstream_video_id": created.ID})
	completed, err := waitGrokVideoJob(ctx, base, a.config.InternalServiceToken(), created.ID, 2*time.Second)
	if err != nil {
		return nil, err
	}

	taskID := firstNonEmpty(util.Clean(payload["client_task_id"]), util.Clean(payload["task_id"]), created.ID)
	ownerID := util.Clean(payload["owner_id"])
	assetID := service.VideoAssetID(ownerID, taskID)
	path := a.videos.ContentPath(ownerID, taskID)
	sizeBytes, contentType, err := downloadGrokVideoToFile(ctx, base, a.config.InternalServiceToken(), completed.ID, path)
	if err != nil {
		return nil, err
	}
	service.ReportTaskEvent(ctx, "video_archived", "视频已归档到主服务", map[string]any{"bytes": sizeBytes})
	return map[string]any{
		"output_type": "video",
		"data": []map[string]any{{
			"url":          "/api/videos/" + url.PathEscape(assetID) + "/content",
			"content_type": firstNonEmpty(contentType, "video/mp4"),
			"video_id":     completed.ID,
			"seconds":      util.ToInt(payload["seconds"], 6),
			"size":         util.Clean(payload["size"]),
		}},
	}, nil
}

func (a *App) runLoggedVideoTask(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
	started := time.Now()
	payload["owner_id"] = identityScope(identity)
	payload["owner_name"] = identityDisplayName(identity)
	model := firstNonEmpty(util.Clean(payload["model"]), "grok-imagine-video")
	charge, billingErr := a.deductVideoCredits(identity, payload)
	if billingErr != nil {
		message := creditBillingMessage(billingErr)
		a.logCall(identity, "Grok 视频生成", http.MethodPost, "/api/creation-tasks/video-generations", model, started, "failed", creditBillingHTTPStatus(billingErr), message, nil)
		return map[string]any{"data": []any{}, "message": message}, billingErr
	}
	defer func() {
		if value := recover(); value != nil {
			a.refundImageCredits(charge)
			panic(value)
		}
	}()
	result, err := a.runGrokNativeVideoGeneration(ctx, payload)
	if err != nil {
		a.refundImageCredits(charge)
		message := service.FriendlyImageTaskErrorForHTTP(err)
		a.logCall(identity, "Grok 视频生成", http.MethodPost, "/api/creation-tasks/video-generations", model, started, "failed", protocolErrorHTTPStatus(err), message, nil)
		return result, err
	}
	items := util.AsMapSlice(result["data"])
	if len(items) == 0 {
		a.refundImageCredits(charge)
		err = videoRuntimeError(http.StatusBadGateway, "video_result_empty", "视频任务未返回有效文件")
		a.logCall(identity, "Grok 视频生成", http.MethodPost, "/api/creation-tasks/video-generations", model, started, "failed", http.StatusBadGateway, err.Error(), nil)
		return result, err
	}
	urls := make([]string, 0, len(items))
	for _, item := range items {
		if value := util.Clean(item["url"]); value != "" {
			urls = append(urls, value)
		}
	}
	a.logCall(identity, "Grok 视频生成", http.MethodPost, "/api/creation-tasks/video-generations", model, started, "success", http.StatusOK, "", urls)
	if _, recordErr := a.videos.Record(service.VideoAsset{
		TaskID: util.Clean(payload["client_task_id"]), OwnerID: identityScope(identity), OwnerName: identityDisplayName(identity),
		Prompt: util.Clean(payload["prompt"]), Model: model, Seconds: util.ToInt(payload["seconds"], 6),
		Size: util.Clean(payload["size"]), ResolutionName: util.Clean(payload["resolution_name"]),
		Preset: util.Clean(payload["preset"]), CreatedAt: util.NowISO(),
	}); recordErr != nil {
		a.refundImageCredits(charge)
		_ = os.Remove(a.videos.ContentPath(identityScope(identity), util.Clean(payload["client_task_id"])))
		if a.logger != nil {
			a.logger.Error("record generated video failed", "task_id", util.Clean(payload["client_task_id"]), "owner_id", identityScope(identity), "error", recordErr.Error())
		}
		return nil, fmt.Errorf("视频已生成但归档索引保存失败: %w", recordErr)
	}
	return result, nil
}

func (a *App) deductVideoCredits(identity service.Identity, payload map[string]any) (*imageCreditCharge, error) {
	if a.credits == nil {
		return nil, nil
	}
	userID := imageCreditUserID(identity)
	if userID == "" {
		return nil, fmt.Errorf("视频积分功能需要绑定用户账号")
	}
	seconds := util.ToInt(payload["seconds"], 6)
	if seconds < 1 {
		seconds = 6
	}
	clientTaskID := firstNonEmpty(util.Clean(payload["client_task_id"]), util.Clean(payload["task_id"]))
	if clientTaskID == "" {
		clientTaskID = util.NewHex(12)
	}
	refID := strings.Trim("/api/creation-tasks/video-generations", "/") + ":" + clientTaskID
	return a.deductCreationCreditsOnce(userID, a.config.VideoCreditCostPerSecond()*seconds, 1, service.CreditReasonVideoGeneration, service.CreditReasonVideoRefund, refID)
}

func createGrokVideoJob(ctx context.Context, base, token string, payload map[string]any) (grokVideoJob, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return grokVideoJob{}, err
	}
	status, data, err := doGrokVideoJSON(ctx, base, token, http.MethodPost, "/internal/v1/videos", body)
	if err != nil {
		return grokVideoJob{}, err
	}
	if status < 200 || status >= 300 {
		return grokVideoJob{}, grokVideoResponseError(status, data)
	}
	return decodeGrokVideoJob(data)
}

func waitGrokVideoJob(ctx context.Context, base, token, videoID string, interval time.Duration) (grokVideoJob, error) {
	if strings.TrimSpace(videoID) == "" {
		return grokVideoJob{}, videoRuntimeError(http.StatusBadGateway, "video_job_missing", "视频上游未返回任务 ID")
	}
	if interval <= 0 {
		interval = 2 * time.Second
	}
	for {
		status, data, err := doGrokVideoJSON(ctx, base, token, http.MethodGet, "/internal/v1/videos/"+url.PathEscape(videoID), nil)
		if err != nil {
			return grokVideoJob{}, err
		}
		if status < 200 || status >= 300 {
			return grokVideoJob{}, grokVideoResponseError(status, data)
		}
		job, err := decodeGrokVideoJob(data)
		if err != nil {
			return grokVideoJob{}, err
		}
		if sink := service.TaskProgressFromContext(ctx); sink != nil {
			progress := grokVideoTaskProgress(job.Progress)
			sink.SetProgress(progress, "正在生成视频", fmt.Sprintf("Grok 视频生成 %d%%", progress))
		}
		switch strings.ToLower(strings.TrimSpace(job.Status)) {
		case "completed", "success", "succeeded":
			return job, nil
		case "failed", "error", "cancelled":
			message := firstNonEmpty(util.Clean(job.Error["message"]), "Grok 视频生成失败")
			return grokVideoJob{}, videoRuntimeError(http.StatusBadGateway, "video_generation_failed", message)
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return grokVideoJob{}, ctx.Err()
		case <-timer.C:
		}
	}
}

func grokVideoTaskProgress(upstreamProgress int) int {
	return 55 + max(0, min(upstreamProgress, 100))*35/100
}

func downloadGrokVideoToFile(ctx context.Context, base, token, videoID, destination string) (int64, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(base, "/")+"/internal/v1/videos/"+url.PathEscape(videoID)+"/content", nil)
	if err != nil {
		return 0, "", err
	}
	if strings.TrimSpace(token) != "" {
		req.Header.Set("X-Internal-Token", strings.TrimSpace(token))
	}
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return 0, "", videoRuntimeError(http.StatusBadGateway, "grok_native_unreachable", err.Error())
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, readErr := util.ReadAllLimited(resp.Body, 4<<20)
		if readErr != nil {
			return 0, "", videoRuntimeError(http.StatusBadGateway, "video_content_read_failed", readErr.Error())
		}
		return 0, "", grokVideoResponseError(resp.StatusCode, data)
	}
	if resp.ContentLength > maxVideoContentBytes {
		return 0, "", videoRuntimeError(http.StatusBadGateway, "video_content_read_failed", fmt.Sprintf("content exceeds %d byte limit", maxVideoContentBytes))
	}
	reader := bufio.NewReader(resp.Body)
	if _, peekErr := reader.Peek(1); peekErr != nil {
		if peekErr == io.EOF {
			return 0, "", videoRuntimeError(http.StatusBadGateway, "video_content_empty", "视频上游返回空文件")
		}
		return 0, "", videoRuntimeError(http.StatusBadGateway, "video_content_read_failed", peekErr.Error())
	}
	written, writeErr := storage.AtomicWriteFromReader(destination, reader, maxVideoContentBytes, 0o644)
	if writeErr != nil {
		return 0, "", videoRuntimeError(http.StatusBadGateway, "video_content_read_failed", writeErr.Error())
	}
	return written, strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]), nil
}

func doGrokVideoJSON(ctx context.Context, base, token, method, path string, body []byte) (int, []byte, error) {
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(base, "/")+path, reader)
	if err != nil {
		return 0, nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(token) != "" {
		req.Header.Set("X-Internal-Token", strings.TrimSpace(token))
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return 0, nil, videoRuntimeError(http.StatusBadGateway, "grok_native_unreachable", err.Error())
	}
	defer resp.Body.Close()
	data, err := util.ReadAllLimited(resp.Body, 4<<20)
	if err != nil {
		return resp.StatusCode, nil, err
	}
	return resp.StatusCode, data, nil
}

func decodeGrokVideoJob(data []byte) (grokVideoJob, error) {
	var job grokVideoJob
	if err := json.Unmarshal(data, &job); err != nil {
		return grokVideoJob{}, fmt.Errorf("grok-runtime invalid video json: %w", err)
	}
	if strings.TrimSpace(job.ID) == "" {
		return grokVideoJob{}, videoRuntimeError(http.StatusBadGateway, "video_job_missing", "视频上游未返回任务 ID")
	}
	return job, nil
}

func grokVideoResponseError(status int, data []byte) error {
	message, errorType, code, _ := grokRuntimeErrorDetails(data, status)
	return &protocol.ImageGenerationError{
		Message: message, StatusCode: http.StatusBadGateway, UpstreamHTTPStatus: status,
		Type: errorType, Code: code,
	}
}

func videoRuntimeError(status int, code, message string) error {
	return &protocol.ImageGenerationError{Message: message, StatusCode: status, Type: "server_error", Code: code}
}

func grokVideoPath(dataDir, taskID string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(taskID)))
	return filepath.Join(dataDir, "videos", hex.EncodeToString(sum[:])+".mp4")
}
