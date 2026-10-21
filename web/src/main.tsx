import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import "@/app/globals.css";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { applyColorTheme, getPreferredColorTheme } from "@/lib/theme";

const ASSET_RELOAD_AT_KEY = "shengtu:asset-reload-at";
const ASSET_RELOAD_COOLDOWN_MS = 60_000;

// Recover once when a lazy chunk fails after deploy (old tab → missing hashed assets).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();

  const now = Date.now();
  try {
    const lastReloadAt = Number(sessionStorage.getItem(ASSET_RELOAD_AT_KEY) ?? "0");
    if (now - lastReloadAt < ASSET_RELOAD_COOLDOWN_MS) {
      return;
    }
    sessionStorage.setItem(ASSET_RELOAD_AT_KEY, String(now));
  } catch {
    // Ignore storage access errors in restricted browsing modes.
  }
  window.location.reload();
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

applyColorTheme(getPreferredColorTheme());

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
