import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type ComposableKeyboardEvent =
  | KeyboardEvent
  | ReactKeyboardEvent<HTMLElement>;

/**
 * Returns true when an IME (Chinese/Japanese/Korean input method) is actively
 * composing characters. Prevents Enter from prematurely submitting half-typed text.
 */
export function isImeComposing(event: ComposableKeyboardEvent): boolean {
  const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
  return Boolean(nativeEvent.isComposing) || event.keyCode === 229;
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}
