package service

import "chatgpt2api/internal/util"

func (t *ImageTask) applyUpdates(updates map[string]any) {
	if t == nil || len(updates) == 0 {
		return
	}
	for key, value := range updates {
		switch key {
		case "status":
			t.Status = util.Clean(value)
		case "mode":
			t.Mode = util.Clean(value)
		case "model":
			t.Model = util.Clean(value)
		case "size":
			t.Size = util.Clean(value)
		case "quality":
			t.Quality = util.Clean(value)
		case "output_format":
			t.OutputFormat = NormalizeImageOutputFormat(util.Clean(value))
		case "output_compression":
			if compression, ok := normalizedImageOutputCompressionValue(value); ok {
				t.OutputCompression = &compression
			} else {
				t.OutputCompression = nil
			}
		case "visibility":
			t.Visibility = util.Clean(value)
		case "effective_provider":
			t.EffectiveProvider = util.Clean(value)
		case "effective_channel":
			t.EffectiveChannel = util.Clean(value)
		case "provider_source":
			t.ProviderSource = util.Clean(value)
		case "effective_model":
			t.EffectiveModel = util.Clean(value)
		case "upstream_host":
			t.UpstreamHost = util.Clean(value)
		case "upstream_http_status":
			t.UpstreamHTTPStatus = util.ToInt(value, 0)
			t.upstreamHTTPStatusSet = true
		case "upstream_cf_ray":
			t.UpstreamCFRay = util.Clean(value)
		case "retry_index":
			t.RetryIndex = util.ToInt(value, 0)
			t.retryIndexSet = true
		case "attempt_count":
			t.AttemptCount = util.ToInt(value, 0)
			t.attemptCountSet = true
		case "count":
			t.Count = util.ToInt(value, t.Count)
		case "data":
			t.Data = coerceTaskData(value)
		case "error":
			t.Error = util.Clean(value)
		case "error_code":
			t.ErrorCode = util.Clean(value)
		case "upstream_request_id":
			t.UpstreamRequestID = util.Clean(value)
		case "troubleshooting":
			t.Troubleshooting = util.Clean(value)
		case "output_type":
			t.OutputType = util.Clean(value)
		case "progress":
			t.Progress = util.ToInt(value, 0)
			t.progressSet = true
		case "progress_stage":
			t.ProgressStage = util.Clean(value)
		case "progress_message":
			t.ProgressMessage = util.Clean(value)
		case "account_label":
			t.AccountLabel = util.Clean(value)
		case "account_token_hash":
			t.AccountTokenHash = util.Clean(value)
		case "account_switch_count":
			t.AccountSwitchCount = util.ToInt(value, 0)
			t.accountSwitchCountSet = true
		case "log_count":
			t.LogCount = util.ToInt(value, 0)
			t.logCountSet = true
		case "started_at":
			t.StartedAt = util.Clean(value)
		case "finished_at":
			t.FinishedAt = util.Clean(value)
		case "duration_seconds":
			t.DurationSeconds = toFloat64(value)
			t.durationSecondsSet = true
		case "events":
			t.Events = restoreTaskEvents(value)
		case "owner_name":
			t.OwnerName = util.Clean(value)
		case "owner_id", "id":
			// Identity and task ID are immutable after submission.
		case "created_at":
			if text := util.Clean(value); text != "" {
				t.CreatedAt = text
			}
		case "updated_at":
			if text := util.Clean(value); text != "" {
				t.UpdatedAt = text
			}
		}
	}
	t.applyObservabilityUpdates(updates)
}

func coerceTaskData(value any) []map[string]any {
	if value == nil {
		return []map[string]any{}
	}
	if data := util.AsMapSlice(value); data != nil {
		return data
	}
	return []map[string]any{}
}

func restoreTaskEvents(raw any) []map[string]any {
	switch typed := raw.(type) {
	case []map[string]any:
		return typed
	case []any:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if mapped, ok := item.(map[string]any); ok {
				out = append(out, mapped)
			}
		}
		return out
	default:
		return nil
	}
}
