package service

import (
	"chatgpt2api/internal/util"
	"context"
	"errors"
	"fmt"
	"log"
	"runtime/debug"
)

const imageTaskInternalPanicMessage = "任务内部错误，请稍后重试"

func (s *ImageTaskService) recoverTaskPanic(key string) {
	value := recover()
	if value == nil {
		return
	}
	taskID := key
	s.mu.RLock()
	if task := s.tasks[key]; task != nil && util.Clean(task.ID) != "" {
		taskID = util.Clean(task.ID)
	}
	s.mu.RUnlock()
	log.Printf("image task panic recovered: task_id=%s panic=%v\n%s", taskID, value, debug.Stack())
	s.finishActiveTask(key, map[string]any{
		"status":           TaskStatusError,
		"error":            imageTaskInternalPanicMessage,
		"error_code":       "internal_panic",
		"data":             []any{},
		"progress":         100,
		"progress_stage":   "失败",
		"progress_message": imageTaskInternalPanicMessage,
		"log_count":        12,
	})
}

func (s *ImageTaskService) runTask(ctx context.Context, key, mode string, identity Identity, payload map[string]any) {
	defer s.removeTaskCancel(key)
	startedAt := util.NowLocal()
	bridge := &taskProgressBridge{service: s, key: key}
	ctx = WithTaskProgress(ctx, bridge)
	s.transitionTaskStage(key, "prepare")
	s.bumpTaskProgress(key, 10, "正在准备对话", "初始化任务上下文", 1, map[string]any{"started_at": startedAt})
	s.appendTaskEvent(key, "prepare", "初始化任务上下文", map[string]any{"progress": 10})
	if provider := util.Clean(payload["effective_provider"]); provider != "" {
		s.appendTaskEvent(key, "route_selected", "已冻结生图路由: "+provider, map[string]any{
			"effective_provider": provider,
			"effective_channel":  util.Clean(payload["effective_channel"]),
			"provider_source":    util.Clean(payload["provider_source"]),
			"effective_model":    util.Clean(payload["effective_model"]),
			"upstream_host":      util.Clean(payload["upstream_host"]),
		})
	}
	if effectiveModel := util.Clean(payload["effective_model"]); effectiveModel != "" {
		payload = util.CopyMap(payload)
		payload["model"] = effectiveModel
	}

	// The task deadline starts before the channel slot queue. Waiting with the
	// submission-time context (no deadline) let a saturated channel park a worker
	// indefinitely, so a queued task now times out like any other phase.
	runCtx, cancel := context.WithTimeout(ctx, s.taskTimeoutForPayload(mode, payload))
	defer cancel()

	if isImageTaskMode(mode) {
		channel := firstNonEmpty(util.Clean(payload["effective_channel"]), imageTaskChannel(util.Clean(payload["model"])))
		waitMsg := "等待 " + channel + " 渠道并发槽位"
		s.transitionTaskStage(key, "slot_wait")
		s.bumpTaskProgress(key, 18, "正在获取令牌", waitMsg, 2, nil)
		s.appendTaskEvent(key, "slot_wait", waitMsg, map[string]any{"channel": channel})
		slots, ok := s.acquireImageSlots(runCtx, s.imageTaskSlotRequest(payload, channel), channel, util.ToInt(payload["channel_max_concurrency"], 0))
		if !ok {
			updates := map[string]any{
				"status": TaskStatusCancelled, "error": "任务已终止", "data": []any{},
				"progress": 100, "progress_stage": "已取消", "progress_message": "任务已终止",
			}
			// A deadline that expired while queued is a timeout, not a user cancel.
			if ctx.Err() == nil && errors.Is(runCtx.Err(), context.DeadlineExceeded) {
				message := "等待渠道并发槽位超时，请稍后重试"
				updates = map[string]any{
					"status": TaskStatusError, "error": message, "error_code": "slot_wait_timeout",
					"data": []any{}, "progress": 100, "progress_stage": "失败", "progress_message": message,
				}
			}
			s.finishActiveTask(key, updates)
			return
		}
		defer s.releaseImageSlots(slots, channel)
		s.appendTaskEvent(key, "slot_acquired", "已获得并发槽位", map[string]any{"slots": slots, "channel": channel})
	}
	if !s.updateActiveTask(key, map[string]any{
		"status": TaskStatusRunning, "error": "",
		"progress": 28, "progress_stage": "正在分配账号", "progress_message": "申请号池账户锁并检测可用性",
	}) {
		return
	}
	s.transitionTaskStage(key, "account_wait")
	s.appendTaskEvent(key, "account_alloc", "开始分配账号", nil)

	handler := s.generation
	if mode == "edit" {
		handler = s.edit
	} else if mode == "chat" {
		handler = s.chat
	} else if mode == "response-image" {
		handler = s.responseImage
	} else if mode == "video" {
		handler = s.video
	}
	if handler == nil {
		s.finishActiveTask(key, map[string]any{
			"status": TaskStatusError, "error": "当前未配置视频生成处理器", "error_code": "video_handler_unavailable",
			"data": []any{}, "progress": 100, "progress_stage": "失败", "progress_message": "当前未配置视频生成处理器",
		})
		return
	}
	s.transitionTaskStage(key, "upstream_prepare")
	s.bumpTaskProgress(key, 45, "正在准备上游", "校验账号状态并建立上游请求", 5, nil)
	s.appendTaskEvent(key, "upstream_prepare", "已完成上游请求准备", nil)
	s.transitionTaskStage(key, "upstream_and_media")
	s.bumpTaskProgress(key, 55, "正在启动生成", "调用上游生图", 6, nil)
	result, err := handler(runCtx, identity, payload)
	if err != nil {
		status := TaskStatusError
		errorInfo := classifyImageTaskError(err)
		message := errorInfo.Message
		if mode == "video" && errorInfo.Code == "upstream_timeout" {
			message = "视频生成超时，请稍后重试，或缩短视频时长。"
			errorInfo.Troubleshooting = "建议缩短视频时长后重试；管理员请检查 Console 视频额度、出口与上游任务状态。"
		}
		stage := "失败"
		if ctx.Err() != nil {
			status = TaskStatusCancelled
			message = "任务已终止"
			stage = "已取消"
			errorInfo = ImageTaskErrorInfo{}
		} else if runCtx.Err() == context.DeadlineExceeded {
			message = "图片生成超时，请稍后重试，或降低分辨率/质量/数量；如经常超时可在设置中调大图片任务超时时间。"
			if mode == "video" {
				message = "视频生成超时，请稍后重试，或缩短视频时长。"
				errorInfo.Troubleshooting = "建议缩短视频时长后重试；管理员请检查 Console 视频额度、出口与上游任务状态。"
			} else {
				errorInfo.Troubleshooting = "建议降低分辨率/数量后重试；管理员可调大图片任务超时时间并检查代理。"
			}
			errorInfo.Code = "upstream_timeout"
		}
		updates := map[string]any{
			"status": status, "error": message, "data": taskResultData(result),
			"progress": 100, "progress_stage": stage, "progress_message": message, "log_count": 12,
		}
		if errorInfo.Code != "" {
			updates["error_code"] = errorInfo.Code
		}
		if errorInfo.UpstreamRequestID != "" {
			updates["upstream_request_id"] = errorInfo.UpstreamRequestID
		}
		if errorInfo.Troubleshooting != "" {
			updates["troubleshooting"] = errorInfo.Troubleshooting
		}
		if outputType := util.Clean(result["output_type"]); outputType != "" {
			updates["output_type"] = outputType
		}
		applyImageTaskErrorMetadata(updates, errorInfo)
		s.finishActiveTask(key, updates)
		return
	}
	s.transitionTaskStage(key, "result_processing")
	s.bumpTaskProgress(key, 82, "正在处理结果", "解析上游返回并整理图片媒体", 8, nil)
	s.appendTaskEvent(key, "result_processing", "开始处理上游结果", nil)
	data := util.AsMapSlice(result["data"])
	outputType := util.Clean(result["output_type"])
	if mode == "response-image" && outputType == "text" {
		raw := firstNonEmpty(util.Clean(result["message"]), "图片生成失败，返回了文本结果")
		errorInfo := classifyImageTaskError(fmt.Errorf("%s", raw))
		message := errorInfo.Message
		updates := map[string]any{
			"status": TaskStatusError, "error": message, "data": []any{},
			"progress": 100, "progress_stage": "失败", "progress_message": message, "log_count": 12,
		}
		if errorInfo.Code != "" {
			updates["error_code"] = errorInfo.Code
		}
		if errorInfo.UpstreamRequestID != "" {
			updates["upstream_request_id"] = errorInfo.UpstreamRequestID
		}
		if errorInfo.Troubleshooting != "" {
			updates["troubleshooting"] = errorInfo.Troubleshooting
		}
		if outputType != "" {
			updates["output_type"] = outputType
		}
		applyImageTaskErrorMetadata(updates, errorInfo)
		s.finishActiveTask(key, updates)
		return
	}
	if outputType == "text" && len(data) == 0 {
		if text := util.Clean(result["message"]); text != "" {
			data = []map[string]any{{"text_response": text}}
		}
	}
	if len(data) == 0 {
		raw := firstNonEmpty(util.Clean(result["message"]), "task returned no output data")
		errorInfo := classifyImageTaskError(fmt.Errorf("%s", raw))
		message := errorInfo.Message
		updates := map[string]any{
			"status": TaskStatusError, "error": message, "data": []any{},
			"progress": 100, "progress_stage": "失败", "progress_message": message, "log_count": 12,
		}
		if errorInfo.Code != "" {
			updates["error_code"] = errorInfo.Code
		}
		if errorInfo.UpstreamRequestID != "" {
			updates["upstream_request_id"] = errorInfo.UpstreamRequestID
		}
		if errorInfo.Troubleshooting != "" {
			updates["troubleshooting"] = errorInfo.Troubleshooting
		}
		if outputType != "" {
			updates["output_type"] = outputType
		}
		applyImageTaskErrorMetadata(updates, errorInfo)
		s.finishActiveTask(key, updates)
		return
	}
	s.transitionTaskStage(key, "image_download")
	s.bumpTaskProgress(key, 92, "正在保存图片", "写入媒体存储并生成可访问地址", 10, nil)
	s.appendTaskEvent(key, "image_download", "已完成图片归档", nil)
	updates := map[string]any{
		"status": TaskStatusSuccess, "data": data, "error": "",
		"progress": 100, "progress_stage": "已完成", "progress_message": "任务已完成", "log_count": 15,
	}
	if outputType != "" {
		updates["output_type"] = outputType
	}
	s.finishActiveTask(key, updates)
}
