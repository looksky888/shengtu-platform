type NumericRule = {
  key: string;
  label: string;
  min: number;
  max?: number;
};

const capacityRules: NumericRule[] = [
  {
    key: "refresh_account_interval_minute",
    label: "账号刷新间隔",
    min: 1,
    max: 1440,
  },
  { key: "image_concurrent_limit", label: "本地号池生图并发", min: 1, max: 100 },
  { key: "image_worker_count", label: "图片 Worker", min: 1, max: 100 },
  { key: "image_queue_capacity", label: "图片等待队列", min: 1, max: 2000 },
  { key: "video_worker_count", label: "视频 Worker", min: 1, max: 32 },
  { key: "video_queue_capacity", label: "视频等待队列", min: 1, max: 1000 },
  { key: "image_task_timeout_seconds", label: "图片任务超时", min: 30, max: 3600 },
  { key: "user_default_concurrent_limit", label: "用户默认并发上限", min: 0 },
  { key: "user_default_rpm_limit", label: "用户默认请求速率", min: 0 },
  {
    key: "api_key_default_rpm_limit",
    label: "API Key 默认请求速率",
    min: 0,
    max: 100000,
  },
  {
    key: "api_key_default_concurrent_limit",
    label: "API Key 默认并发上限",
    min: 0,
    max: 10000,
  },
  {
    key: "api_key_daily_request_limit",
    label: "API Key 每日调用配额",
    min: 0,
    max: 10000000,
  },
  { key: "image_account_concurrency", label: "单账号生图并发", min: 1, max: 10 },
  { key: "image_retention_days", label: "生成图片保留周期", min: 1, max: 3650 },
  { key: "video_retention_days", label: "生成视频保留周期", min: 1, max: 3650 },
];

function isValidHttpBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function capacityErrors(
  config: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {};

  const rawBaseUrl = String(config.base_url ?? "").trim();
  if (rawBaseUrl && !isValidHttpBaseUrl(rawBaseUrl)) {
    errors.base_url = "请填写以 http:// 或 https:// 开头的完整站点访问地址";
  }

  for (const rule of capacityRules) {
    const raw = config[rule.key];
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    const value = text === "" ? Number.NaN : Number(text);
    if (
      !Number.isInteger(value) ||
      value < rule.min ||
      (rule.max !== undefined && value > rule.max)
    ) {
      errors[rule.key] =
        `${rule.label}必须为 ${rule.min}–${rule.max ?? "不限"} 的整数`;
    }
  }

  return errors;
}
