import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const releaseVersion = readFileSync(path.resolve(webRoot, "../VERSION.txt"), "utf8").trim();
const appVersion = process.env.VITE_APP_VERSION || releaseVersion || process.env.npm_package_version || "0.0.0-dev";
const distDir = path.resolve(webRoot, process.env.WEB_DIST_DIR || "../internal/web/dist");

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
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("react-router")) {
            return "vendor-react";
          }
          if (id.includes("framer-motion") || id.includes("/motion/")) {
            return "vendor-motion";
          }
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("sonner")) {
            return "vendor-ui";
          }
          return "vendor";
        },
      },
    },
  },
});
