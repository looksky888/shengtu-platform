export type ImageModelSelectionMode = "chat" | "image";

type ResolveImageModelOptions = {
  mode: ImageModelSelectionMode;
  requestedModel: unknown;
  channelModelId?: unknown;
  defaultModel: string;
  isKnownModel: (value: string) => boolean;
};

/**
 * A channel model is configured by the administrator and therefore is not
 * necessarily present in the static frontend model list. Keep that explicit
 * selection instead of silently replacing it with the local default model.
 */
export function resolveImageModel({
  mode,
  requestedModel,
  channelModelId,
  defaultModel,
  isKnownModel,
}: ResolveImageModelOptions): string {
  const requested = String(requestedModel || "").trim();
  const configuredChannelModel = String(channelModelId || "").trim();
  if (mode === "image" && configuredChannelModel && requested) {
    return requested;
  }
  return requested && isKnownModel(requested) ? requested : defaultModel;
}
