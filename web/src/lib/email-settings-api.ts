import type { EmailSettings } from "@/lib/api-types";
import { httpRequest } from "@/lib/request";

export async function fetchEmailSettings() {
  return httpRequest<{ settings: EmailSettings }>("/api/admin/email-settings");
}

export async function updateEmailSettings(settings: EmailSettings) {
  return httpRequest<{ settings: EmailSettings }>("/api/admin/email-settings", {
    method: "PUT",
    body: settings,
  });
}

export async function testEmailSettings(recipient: string) {
  return httpRequest<{ sent: boolean }>("/api/admin/email-settings/test", {
    method: "POST",
    body: { recipient },
  });
}
