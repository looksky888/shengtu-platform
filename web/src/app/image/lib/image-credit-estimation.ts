import type { ImageResolution } from "@/app/image/image-options";
import type { ImageCreditCosts } from "./image-page-types";

export const FALLBACK_IMAGE_CREDIT_COSTS: ImageCreditCosts = {
  "1080p": 1,
  "2k": 2,
  "4k": 3,
  gptImage2: 1,
  gptImage25: 2,
  gptImage25Flare: 3,
  gptImage25Sunburst: 3,
  grok1k: 1,
  grok2k: 2,
};

function isGrokModelName(model: string): boolean {
  const normalized = String(model || "").trim().toLowerCase();
  return normalized.startsWith("grok-");
}

export function estimatedCreditsPerImage(
  resolution: ImageResolution,
  costs: ImageCreditCosts = FALLBACK_IMAGE_CREDIT_COSTS,
): number {
  switch (resolution) {
    case "2k":
      return costs["2k"];
    case "4k":
      return costs["4k"];
    case "auto":
    case "1k":
    case "1080p":
    default:
      return costs["1080p"];
  }
}

export function estimatedCreditsPerImageForModel(
  model: string,
  resolution: ImageResolution,
  size: string,
  costs: ImageCreditCosts = FALLBACK_IMAGE_CREDIT_COSTS,
): number {
  const normalizedModel = String(model || "").trim();
  if (isGrokModelName(normalizedModel)) {
    return resolution === "2k" ? costs.grok2k : costs.grok1k;
  }
  switch (normalizedModel) {
    case "gpt-image-2":
      return costs.gptImage2;
    case "gpt-image-2.5":
      return costs.gptImage25;
    case "gpt-image-2.5-flare":
      return costs.gptImage25Flare;
    case "gpt-image-2.5-sunburst":
      return costs.gptImage25Sunburst;
    default:
      break;
  }
  if (resolution === "4k") return costs["4k"];
  if (resolution === "2k") return costs["2k"];
  const normalizedSize = String(size || "").trim().toLowerCase();
  if (normalizedSize.includes("4k") || normalizedSize.includes("2880") || normalizedSize.includes("4096")) {
    return costs["4k"];
  }
  if (normalizedSize.includes("2k") || normalizedSize.includes("2048")) {
    return costs["2k"];
  }
  return estimatedCreditsPerImage(resolution, costs);
}
