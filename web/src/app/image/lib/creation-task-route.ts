import { isGPTImageModel, isGrokImageModel, isResponseImageToolModel, type ImageModel } from "@/lib/api-models";
import { resolveImageTaskRoute, type CreationTaskRouteKind } from "./creation-task-route-rules";

/**
 * Mirrors backend util.UsesResponseImageCreationTask / ResolveCreationTaskRoute.
 *
 * auto / gpt-image-2.5-* / legacy gpt-image-2 / grok-* -> picture_v2 image-generations (or edits) / grok proxy
 * gpt-5* responses tool models -> response-image-generations
 */
export function usesResponseImageTaskModel(model: ImageModel | string): boolean {
  if (isGrokImageModel(model)) return false;
  return model !== "auto" && !isGPTImageModel(model) && isResponseImageToolModel(model);
}

export type { CreationTaskRouteKind } from "./creation-task-route-rules";

export function resolveCreationTaskRoute(
  mode: string,
  model: ImageModel | string,
  hasReferenceImages: boolean,
): CreationTaskRouteKind {
  return resolveImageTaskRoute(
    mode,
    usesResponseImageTaskModel(model),
    hasReferenceImages,
    model.trim().toLowerCase() === "grok-imagine-image-edit",
  );
}
