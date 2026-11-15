import type {
  ImageChannelModel,
  ImageChannelModelInput,
} from "@/lib/image-channel-api";
import { isVideoChannelModelId } from "@/lib/model-catalog-normalizers";

const defaultModelInput: ImageChannelModelInput = {
  display_name: "",
  upstream_model: "",
  capabilities: ["generate", "edit"],
  resolutions: ["1k"],
  formats: ["png"],
  credit_cost: 1,
  credit_costs: { "1k": 1 },
  enabled: true,
  sort: 10,
};

export function toImageChannelModelInput(
  model: ImageChannelModel | null,
  overrides?: Partial<ImageChannelModelInput>,
): ImageChannelModelInput {
  if (!model) {
    return {
      ...defaultModelInput,
      ...overrides,
    };
  }
  const safeCapabilities = Array.isArray(model.capabilities)
    ? [...model.capabilities]
    : [];
  const safeResolutions = Array.isArray(model.resolutions)
    ? [...model.resolutions]
    : [];
  const safeFormats = Array.isArray(model.formats) ? [...model.formats] : [];
  const videoOnly =
    safeCapabilities.length === 0 && isVideoChannelModelId(model.upstream_model);

  return {
    display_name: model.display_name,
    upstream_model: model.upstream_model,
    capabilities: videoOnly
      ? []
      : safeCapabilities.length > 0
        ? safeCapabilities
        : ["generate"],
    resolutions: videoOnly
      ? safeResolutions
      : safeResolutions.length > 0
        ? safeResolutions
        : ["1k"],
    formats: videoOnly
      ? safeFormats
      : safeFormats.length > 0
        ? safeFormats
        : ["png"],
    credit_cost: Math.max(1, Number(model.credit_cost) || 1),
    credit_costs: { ...(model.credit_costs || {}) },
    enabled: model.enabled,
    sort: model.sort,
    ...overrides,
  };
}
