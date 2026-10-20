import type { ImageVisibility } from "@/lib/api";

/** Shared by the studio result cards and the image manager cards. */

export function imageVisibilityLabel(visibility?: ImageVisibility) {
  return visibility === "public" ? "已公开" : "私有";
}

export function imageVisibilityPillClass(visibility?: ImageVisibility) {
  return visibility === "public"
    ? "bg-[#e8f2ff] text-[#1456f0] ring-1 ring-[#bfdbfe]"
    : "bg-[#181e25]/82 text-white ring-1 ring-white/20";
}

export function imageVisibilityActionClass(visibility?: ImageVisibility) {
  return visibility === "public" ? "bg-white/95 text-[#1456f0] hover:bg-[#e8f2ff]" : "bg-white/95 text-stone-800 hover:bg-stone-100";
}

/** Clear focus from a control inside the card when the pointer leaves the card. */
export function blurFocusedElementInContainer(container: HTMLElement) {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
    activeElement.blur();
  }
}
