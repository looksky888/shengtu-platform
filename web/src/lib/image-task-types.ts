import type { ImageModel, ImageOutputFormat, ImageQuality, ImageVisibility } from "@/lib/api-models";

export type ImageResponse = {
  created: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
};

export type CreationTaskData = {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
  text_response?: string;
  width?: number;
  height?: number;
  resolution?: string;
  output_format?: ImageOutputFormat;
  content_type?: string;
  video_id?: string;
  seconds?: number;
};

export type CreationTask = {
  id: string;
  status: "queued" | "running" | "success" | "error" | "cancelled";
  mode: "generate" | "edit" | "chat" | "response-image" | "video";
  model?: ImageModel;
  size?: string;
  quality?: ImageQuality;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  effective_provider?: string;
  effective_channel?: string;
  provider_source?: string;
  effective_model?: string;
  upstream_host?: string;
  upstream_http_status?: number;
  upstream_cf_ray?: string;
  retry_index?: number;
  attempt_count?: number;
  created_at: string;
  updated_at: string;
  data?: CreationTaskData[];
  error?: string;
  error_code?: string;
  upstream_request_id?: string;
  troubleshooting?: string;
  owner_id?: string;
  owner_name?: string;
  count?: number;
  output_type?: "text" | "video";
  visibility?: ImageVisibility;
  progress?: number;
  progress_stage?: string;
  progress_message?: string;
  account_label?: string;
  account_token_hash?: string;
  account_switch_count?: number;
  log_count?: number;
  started_at?: string;
  finished_at?: string;
  duration_seconds?: number;
  stage_durations_ms?: Record<string, number>;
  events?: Array<{
    time?: string;
    stage?: string;
    message?: string;
    progress?: number;
    status?: string;
    account_label?: string;
    grade?: string;
    action?: string;
    reason?: string;
		effective_provider?: string;
		effective_model?: string;
		upstream_host?: string;
		upstream_http_status?: number;
		upstream_request_id?: string;
		upstream_cf_ray?: string;
		retry_index?: number;
		attempt_count?: number;
  }>;
};

export type ImageTaskLogFilters = {
  q?: string;
  status?: string;
  user?: string;
  model?: string;
  size?: string;
  limit?: number;
  offset?: number;
  summary?: boolean;
};

export type TaskExecutorSnapshot = {
  workers: number;
  queue_capacity: number;
  queued: number;
  running: number;
};

export type TaskExecutorsSnapshot = {
  image: TaskExecutorSnapshot;
  relay?: TaskExecutorSnapshot;
  video: TaskExecutorSnapshot;
};

export type CreationTaskMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export type CreationTaskListResponse = {
  items: CreationTask[];
  missing_ids: string[];
};
