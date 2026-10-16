type NumericRule = { key: string; label: string; min: number; max?: number };

const capacityRules: NumericRule[] = [
  { key: "image_concurrent_limit", label: "全局生图并发", min: 1, max: 100 },
  { key: "image_worker_count", label: "图片 Worker", min: 1, max: 100 },
  { key: "image_queue_capacity", label: "图片等待队列", min: 1, max: 2000 },
  { key: "video_worker_count", label: "视频 Worker", min: 1, max: 32 },
  { key: "video_queue_capacity", label: "视频等待队列", min: 1, max: 1000 },
  { key: "image_task_timeout_seconds", label: "图片任务超时", min: 30, max: 3600 },
  { key: "user_default_concurrent_limit", label: "用户默认并发限制", min: 0 },
  { key: "user_default_rpm_limit", label: "用户默认 RPM 限制", min: 0 },
  { key: "api_key_default_rpm_limit", label: "API Key RPM 限制", min: 0, max: 100000 },
  { key: "api_key_default_concurrent_limit", label: "API Key 并发限制", min: 0, max: 10000 },
  { key: "api_key_daily_request_limit", label: "API Key 每日调用额度", min: 0, max: 10000000 },
  { key: "image_account_concurrency", label: "单账号生图并发", min: 1, max: 10 },
];

export function capacityErrors(config: Record<string, unknown>) {
  return Object.fromEntries(capacityRules.flatMap((rule) => {
    const value = Number(config[rule.key]);
    if (!Number.isInteger(value) || value < rule.min || (rule.max !== undefined && value > rule.max)) {
      return [[rule.key, `${rule.label}必须为 ${rule.min}–${rule.max ?? "不限"} 的整数`]];
    }
    return [];
  })) as Record<string, string>;
}
