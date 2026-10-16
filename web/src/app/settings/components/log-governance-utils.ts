export const LOG_LEVEL_OPTIONS = ["debug", "info", "warning", "error"];

export function formatLogTime(value?: string) {
  return value && value.trim() ? value : "\u6682\u65e0\u6570\u636e";
}
