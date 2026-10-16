import { useSyncExternalStore } from "react";

import { getPageVisibilitySnapshot, subscribePageVisibility } from "./page-visibility";

export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribePageVisibility, getPageVisibilitySnapshot, () => true);
}
