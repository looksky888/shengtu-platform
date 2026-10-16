import { useAuthenticatedSSE } from "@/lib/use-authenticated-sse";

import { isTaskQueueRefreshEvent } from "./task-queue-event";

/**
 * Subscribes to admin task-queue SSE and invokes onRefresh when relevant events arrive.
 * Soft-fails on network errors and reconnects with exponential backoff until unmount.
 */
export function useTaskQueueSSE(onRefresh: () => void, enabled = true) {
  useAuthenticatedSSE(
    "/api/admin/task-queue/events",
    (raw) => {
      if (isTaskQueueRefreshEvent(raw)) onRefresh();
    },
    enabled,
  );
}
