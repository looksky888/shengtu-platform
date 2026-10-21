export const LOG_LEVEL_OPTIONS = ["debug", "info", "warning", "error"];

export function formatLogTime(value?: string) {
  return value && value.trim() ? value : "暂无数据";
}
