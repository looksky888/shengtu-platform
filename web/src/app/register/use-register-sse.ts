import type { RegisterConfig } from "@/lib/api";
import { useAuthenticatedSSE } from "@/lib/use-authenticated-sse";

import { parseRegisterEvent } from "./register-event";

export function useRegisterSSE(onConfig: (config: RegisterConfig) => void) {
  useAuthenticatedSSE("/api/register/events", (raw) => {
    const config = parseRegisterEvent(raw);
    if (config) onConfig(config);
  });
}
