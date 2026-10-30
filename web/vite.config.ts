import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const versionFilePath = path.resolve(webRoot, "../VERSION.txt");
const releaseVersion = existsSync(versionFilePath) ? readFileSync(versionFilePath, "utf8").trim() : "";
const appVersion = process.env.VITE_APP_VERSION || releaseVersion || process.env.npm_package_version || "0.0.0-dev";
const distDir = path.resolve(webRoot, process.env.WEB_DIST_DIR || "../internal/web/dist");

function resolveManualChunk(id: string): string | undefined {
  const normalized = id.replace(/\\/g, "/");
  if (!normalized.includes("/node_modules/")) {
    return undefined;
  }
  if (
    normalized.includes("/node_modules/react/") ||
    normalized.includes("/node_modules/react-dom/") ||
    normalized.includes("/node_modules/react-router") ||
    normalized.includes("/node_modules/scheduler/")
  ) {
    return "vendor-react";
  }
  if (
    normalized.includes("/node_modules/motion/") ||
    normalized.includes("/node_modules/framer-motion/") ||
    normalized.includes("/node_modules/motion-dom/") ||
    normalized.includes("/node_modules/motion-utils/")
  ) {
    return "vendor-motion";
  }
  if (normalized.includes("/node_modules/@radix-ui/")) {
    return "vendor-radix";
  }
  if (normalized.includes("/node_modules/lucide-react/")) {
    return "vendor-icons";
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(webRoot, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
});
