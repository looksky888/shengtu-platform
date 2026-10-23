import type { ImageVisibility } from "@/lib/api";

/** Shared by the studio result cards and the image manager cards. */

export function imageVisibilityLabel(visibility?: ImageVisibility) {
  return visibility === "public" ? "已公开" : "私有";
}

export function imageVisibilityPillClass(visibility?: ImageVisibility) {
  return visibility === "public"
    ? "bg-white/92 text-zinc-900 ring-1 ring-black/10 backdrop-blur-sm"
    : "bg-zinc-950/80 text-white ring-1 ring-white/20 backdrop-blur-sm";
}

export function imageVisibilityActionClass(visibility?: ImageVisibility) {
  return visibility === "public"
    ? "bg-white/95 text-zinc-900 hover:bg-zinc-100"
    : "bg-white/95 text-zinc-800 hover:bg-zinc-100";
}

/** Clear focus from a control inside the card when the pointer leaves the card. */
export function blurFocusedElementInContainer(container: HTMLElement) {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
    activeElement.blur();
  }
}
