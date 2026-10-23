export const LOG_LEVEL_OPTIONS = ["debug", "info", "warning", "error"] as const;

export type LogLevelKey = (typeof LOG_LEVEL_OPTIONS)[number];

export const LOG_LEVEL_META: ReadonlyArray<{
  value: LogLevelKey;
  label: string;
  description: string;
  defaultActive: boolean;
}> = [
  {
    value: "debug",
    label: "Debug",
    description: "底层请求参数与诊断追踪（高频）",
    defaultActive: false,
  },
  {
    value: "info",
    label: "Info",
    description: "常规业务事件与关键任务节点",
    defaultActive: true,
  },
  {
    value: "warning",
    label: "Warn",
    description: "限流重试、降级切换与风险告警",
    defaultActive: true,
  },
  {
    value: "error",
    label: "Error",
    description: "上游异常、鉴权失败与系统错误",
    defaultActive: true,
  },
];

export function formatLogTime(value?: string) {
  if (!value || !value.trim()) return "暂无记录";
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(parsed)
    .replace(/\//g, "-");
}
