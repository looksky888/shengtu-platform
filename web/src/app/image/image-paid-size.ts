const MAX_FREE_IMAGE_PIXELS = 1_577_536;
const IMAGE_SIZE_PATTERN = /^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/;

export function requiresPaidAccountImageSize(size: string): boolean {
  const match = size.match(IMAGE_SIZE_PATTERN);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width)
    && Number.isFinite(height)
    && width > 0
    && height > 0
    && width * height > MAX_FREE_IMAGE_PIXELS;
}
