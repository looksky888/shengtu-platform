import type { RegisterConfig } from "@/lib/api";

export function parseRegisterEvent(raw: string): RegisterConfig | null {
  try {
    const parsed = JSON.parse(raw) as { register?: RegisterConfig };
    const config = parsed?.register;
    if (!config || typeof config !== "object") return null;
    if ((config as { error?: string }).error && !config.target) return null;
    return config;
  } catch {
    return null;
  }
}
