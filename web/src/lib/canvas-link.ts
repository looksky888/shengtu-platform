import type { NavItem } from "../components/top-nav-config";

export function canvasLink(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 2048 || /[\\\s]/.test(text)) return "";
  try {
    const url = new URL(text);
    return /^https?:\/\//i.test(text) && ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? text : "";
  } catch {
    return "";
  }
}

export function withCanvasNav(items: NavItem[], value: unknown): NavItem[] {
  const href = canvasLink(value);
  if (!href) return items;
  const result = [...items];
  const index = result.findIndex((item) => item.href === "/image");
  result.splice(index + 1, 0, { href, label: "无限画布", accessPath: "/image", external: true });
  return result;
}
