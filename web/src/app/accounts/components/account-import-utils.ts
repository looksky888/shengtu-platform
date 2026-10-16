export const sessionUrl = "https://chatgpt.com/api/auth/session";

export function splitTokens(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSessionAccessToken(value: unknown) {
  const token = (value as { accessToken?: unknown })?.accessToken;
  return typeof token === "string" ? token.trim() : "";
}

export function getCpaAccessToken(value: unknown) {
  const payload = value as { access_token?: unknown; accessToken?: unknown };
  const token = payload?.access_token ?? payload?.accessToken;
  return typeof token === "string" ? token.trim() : "";
}

export function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error(`读取文件失败: ${file.name}`));
    reader.readAsText(file);
  });
}