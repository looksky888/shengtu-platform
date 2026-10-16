export function isTaskQueueRefreshEvent(raw: string): boolean {
  try {
    const payload = JSON.parse(raw) as { type?: string };
    return payload.type === "task" || payload.type === "refresh" || payload.type === "pool";
  } catch {
    return false;
  }
}
