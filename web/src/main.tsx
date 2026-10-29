import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import "@/app/globals.css";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { tryReloadForStaleAsset } from "@/lib/lazy-with-retry";
import { applyColorTheme, getPreferredColorTheme } from "@/lib/theme";

// Recover once when a lazy chunk fails after deploy (old tab → missing hashed assets).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  tryReloadForStaleAsset();
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
