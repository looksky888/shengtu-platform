export const QUOTA_REFRESH_EVENT = "chatgpt2api:quota-refresh";

export function dispatchQuotaRefresh() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(QUOTA_REFRESH_EVENT));
}
