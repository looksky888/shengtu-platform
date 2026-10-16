import type { RegistrationRiskBlock, RegistrationRiskSettings } from "@/lib/api-types";
import { httpRequest } from "@/lib/request";

const basePath = "/api/admin/registration-risk-settings";

export function fetchRegistrationRiskSettings() {
  return httpRequest<{ settings: RegistrationRiskSettings }>(basePath);
}

export function updateRegistrationRiskSettings(settings: RegistrationRiskSettings) {
  return httpRequest<{ settings: RegistrationRiskSettings }>(basePath, {
    method: "PUT",
    body: settings,
  });
}

export function fetchRegistrationRiskBlocks() {
  return httpRequest<{ items: RegistrationRiskBlock[]; total: number }>(`${basePath}/blocks`);
}

export function deleteRegistrationRiskBlock(id: string) {
  return httpRequest<{ deleted: boolean }>(`${basePath}/blocks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
