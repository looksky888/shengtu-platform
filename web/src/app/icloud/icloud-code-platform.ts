export type ICloudCodePlatform = "auto" | "openai" | "grok" | "higgsfield" | "custom";

export const ICLOUD_CODE_PLATFORM_OPTIONS: Array<{ value: ICloudCodePlatform; label: string }> = [
  { value: "auto", label: "自动识别" },
  { value: "openai", label: "OpenAI / ChatGPT" },
  { value: "grok", label: "Grok / xAI" },
  { value: "higgsfield", label: "Higgsfield AI" },
  { value: "custom", label: "自定义平台" },
];

export function resolveICloudCodeKeyword(platform: ICloudCodePlatform, customKeyword = ""): string {
  switch (platform) {
    case "auto":
      return "auto";
    case "openai":
      return "provider:openai";
    case "grok":
      return "provider:grok";
    case "higgsfield":
      return "provider:higgsfield";
    case "custom":
      return customKeyword.trim();
  }
}
