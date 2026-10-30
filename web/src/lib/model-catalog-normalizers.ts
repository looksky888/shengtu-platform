import type {
  ImageCapability,
  ImageChannelModel,
  PublicImageChannelModel,
} from "./image-channel-api";

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeImageCapabilities(value: unknown): ImageCapability[] {
  return normalizeStringArray(value).filter(
    (capability): capability is ImageCapability =>
      capability === "generate" || capability === "edit",
  );
}

export function isVideoChannelModelId(upstreamModel: string | null | undefined): boolean {
  return String(upstreamModel || "").trim().toLowerCase().includes("video");
}

function normalizeCreditCosts(
  value: unknown,
): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const normalized: Record<string, number> = {};
  for (const [key, rawCost] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = key.trim().toLowerCase();
    const numeric = Number(rawCost);
    if (cleanKey && Number.isFinite(numeric) && numeric > 0) {
      normalized[cleanKey] = numeric;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * Normalizes admin channel models at the API boundary so legacy or video-only
 * channel entries with null slices never crash React table/form rendering.
 */
export function normalizeImageChannelModel(
  model: ImageChannelModel,
): ImageChannelModel {
  const creditCosts = normalizeCreditCosts(model.credit_costs);
  return {
    ...model,
    display_name: String(model.display_name || model.upstream_model || "").trim(),
    upstream_model: String(model.upstream_model || "").trim(),
    capabilities: normalizeImageCapabilities(model.capabilities),
    resolutions: normalizeStringArray(model.resolutions),
    formats: normalizeStringArray(model.formats),
    ...(creditCosts ? { credit_costs: creditCosts } : { credit_costs: undefined }),
  };
}

export function normalizeImageChannelModels(
  value: ImageChannelModel[] | null | undefined,
): ImageChannelModel[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ImageChannelModel => Boolean(item && typeof item === "object"))
    .map(normalizeImageChannelModel);
}

/**
 * Normalizes public channel models at the API boundary.
 * Existing browser caches can contain null arrays from the old serializer.
 * Preserve routing and billing fields exactly; only normalize array fields.
 */
export function normalizePublicImageChannelModels(
  value: PublicImageChannelModel[] | null | undefined,
): PublicImageChannelModel[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PublicImageChannelModel => Boolean(item && typeof item === "object"))
    .map((model) => ({
      ...model,
      capabilities: normalizeImageCapabilities(model.capabilities),
      resolutions: normalizeStringArray(model.resolutions),
      formats: normalizeStringArray(model.formats),
    }));
}
