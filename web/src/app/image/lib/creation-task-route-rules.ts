export type CreationTaskRouteKind = "chat" | "response-image" | "image-edits" | "image-generations";

export function resolveImageTaskRoute(
  mode: string,
  usesResponseImageRoute: boolean,
  hasReferenceImages: boolean,
  isExplicitEditModel: boolean,
): CreationTaskRouteKind {
  if (mode === "chat") return "chat";
  if (usesResponseImageRoute) return "response-image";
  // `image` is the composer mode, not proof that a reference image exists.
  // Text-only image requests stay on image-generations.
  if (hasReferenceImages || mode === "edit" || isExplicitEditModel) {
    return "image-edits";
  }
  return "image-generations";
}
