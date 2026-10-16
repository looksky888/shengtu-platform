interface PageVisibilitySource {
  visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

function currentDocument(): PageVisibilitySource | undefined {
  return typeof document === "undefined" ? undefined : document;
}

export function isPageVisible(source: Pick<PageVisibilitySource, "visibilityState"> | undefined): boolean {
  return source?.visibilityState !== "hidden";
}

export function getPageVisibilitySnapshot(): boolean {
  return isPageVisible(currentDocument());
}

export function subscribePageVisibility(
  listener: () => void,
  source: PageVisibilitySource | undefined = currentDocument(),
): () => void {
  if (!source) return () => undefined;
  source.addEventListener("visibilitychange", listener);
  return () => source.removeEventListener("visibilitychange", listener);
}
