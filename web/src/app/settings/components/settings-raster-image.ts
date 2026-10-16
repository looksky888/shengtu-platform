const rasterImageMIMETypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const rasterImageExtensionPattern = /\.(?:jpe?g|png|gif|webp)$/i;

export const settingsRasterImageAccept = ".jpg,.jpeg,.png,.gif,.webp";

export function isSettingsRasterImage(file: File) {
  const mimeType = file.type.trim().toLowerCase();
  return rasterImageMIMETypes.has(mimeType) || (!mimeType && rasterImageExtensionPattern.test(file.name));
}
