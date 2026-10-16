import type { PublicImageChannelModel } from "./image-channel-api";

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

/**
 * Normalizes public channel models at the API boundary.
 * Existing browser caches can contain null arrays from the old serializer.
 * Preserve routing and billing fields exactly; only normalize array fields.
 */
export function normalizePublicImageChannelModels(value: PublicImageChannelModel[] | null | undefined): PublicImageChannelModel[] {
  return (value ?? []).map((model) => ({
      ...model,
      capabilities: normalizeStringArray(model.capabilities).filter((capability): capability is "generate" | "edit" => capability === "generate" || capability === "edit"),
      resolutions: normalizeStringArray(model.resolutions),
      formats: normalizeStringArray(model.formats),
  }));
}
