export const MIN_SCROLL_RAIL_OVERFLOW_PX = 24;
export const DEFAULT_MIN_SCROLL_THUMB_PX = 38;

export function clampScrollValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isViewportOverflowing(scrollHeight: number, clientHeight: number) {
  return scrollHeight - clientHeight > MIN_SCROLL_RAIL_OVERFLOW_PX;
}

export function computeScrollRailThumb(metrics: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
}) {
  const maxScroll = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const effectiveTrackHeight =
    metrics.trackHeight > 0 ? metrics.trackHeight : Math.max(120, metrics.clientHeight - 72);
  const ratio = maxScroll > 0 ? clampScrollValue(metrics.scrollTop / maxScroll, 0, 1) : 0;
  const rawThumbHeight =
    metrics.scrollHeight > 0
      ? (metrics.clientHeight / metrics.scrollHeight) * effectiveTrackHeight
      : effectiveTrackHeight;
  const minThumb = Math.min(
    DEFAULT_MIN_SCROLL_THUMB_PX,
    Math.max(22, Math.floor(effectiveTrackHeight * 0.35)),
  );
  const maxThumb = Math.max(minThumb, effectiveTrackHeight - 10);
  const thumbHeight = Math.round(clampScrollValue(rawThumbHeight, minThumb, maxThumb));
  const travel = Math.max(0, effectiveTrackHeight - thumbHeight);
  const thumbTop = Math.round(ratio * travel);

  return {
    maxScroll,
    effectiveTrackHeight,
    ratio,
    percent: Math.round(ratio * 100),
    thumbHeight,
    travel,
    thumbTop,
  };
}

export function scrollTopForTrackClick(params: {
  clickOffsetY: number;
  thumbHeight: number;
  travel: number;
  maxScroll: number;
}) {
  if (params.travel <= 0 || params.maxScroll <= 0) {
    return 0;
  }
  const targetThumbTop = clampScrollValue(
    params.clickOffsetY - params.thumbHeight / 2,
    0,
    params.travel,
  );
  return (targetThumbTop / params.travel) * params.maxScroll;
}

export function scrollTopForThumbDrag(params: {
  startScrollTop: number;
  deltaY: number;
  travel: number;
  maxScroll: number;
}) {
  if (params.travel <= 0 || params.maxScroll <= 0) {
    return 0;
  }
  return clampScrollValue(
    params.startScrollTop + (params.deltaY / params.travel) * params.maxScroll,
    0,
    params.maxScroll,
  );
}
