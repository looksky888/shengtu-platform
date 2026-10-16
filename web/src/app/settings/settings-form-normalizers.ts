import type { EmailSettings } from "@/lib/api";

export function normalizeEmailSettingsForm(settings: EmailSettings): EmailSettings {
  return {
    ...settings,
    host: settings.host.trim(),
    username: settings.username.trim(),
    from_email: settings.from_email.trim().toLowerCase(),
    from_name: settings.from_name.trim(),
  };
}

export function splitSettingsLines(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
