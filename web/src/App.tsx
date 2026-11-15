import { useEffect, useState } from "react";
import { Toaster } from "sonner";

import { AppShell } from "@/app/app-shell";
import {
  COLOR_THEME_CHANGE_EVENT,
  getPreferredColorTheme,
  type ColorTheme,
} from "@/lib/theme";

export default function App() {
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => getPreferredColorTheme());

  useEffect(() => {
    const syncColorTheme = (event?: Event) => {
      const detail = (event as CustomEvent<ColorTheme> | undefined)?.detail;
      if (detail === "light" || detail === "dark") {
        setColorTheme(detail);
        return;
      }
      setColorTheme(getPreferredColorTheme());
    };

    syncColorTheme();
    window.addEventListener(COLOR_THEME_CHANGE_EVENT, syncColorTheme);
    window.addEventListener("storage", syncColorTheme);
    return () => {
      window.removeEventListener(COLOR_THEME_CHANGE_EVENT, syncColorTheme);
      window.removeEventListener("storage", syncColorTheme);
    };
  }, []);

  return (
    <>
      <Toaster position="top-center" theme={colorTheme} offset={76} mobileOffset={16} />
      <AppShell />
    </>
  );
}
