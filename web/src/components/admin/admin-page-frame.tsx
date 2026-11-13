"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, MoonStar, Sun } from "lucide-react";

import {
  applyColorTheme,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

export function AdminThemeButton({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => {
      setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const dark = theme === "dark";

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next: ColorTheme = dark ? "light" : "dark";
    const rect = event.currentTarget.getBoundingClientRect();
    setTheme(next);
    saveColorTheme(next);
    applyColorTheme(next, {
      origin: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={dark ? "切换到浅色控制台" : "切换到深色控制台"}
      title={dark ? "切换到浅色模式" : "切换到深色模式"}
      className={cn("admin-page-theme-toggle", className)}
    >
      {dark ? <Sun className="size-3.5" /> : <MoonStar className="size-3.5" />}
    </button>
  );
}

export function AdminPageFrame({
  section,
  groupLabel,
  title,
  description,
  badge,
  back,
  actions,
  scrollable = true,
  className,
  children,
}: {
  section?: string;
  groupLabel?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  back?: {
    label: string;
    onClick: () => void;
  };
  actions?: ReactNode;
  scrollable?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const resolvedSection = section ?? groupLabel;
  return (
    <div
      className={cn(
        "admin-page-frame",
        scrollable && "admin-page-frame-scrollable",
        className,
      )}
    >
      <header className="admin-page-header">
        <div className="min-w-0 flex-1">
          <div className="admin-page-location">
            {back ? (
              <button
                type="button"
                onClick={back.onClick}
                aria-label={back.label}
                title={back.label}
                className="admin-icon-button mr-1 !size-7"
              >
                <ArrowLeft className="size-3.5" />
              </button>
            ) : null}
            {resolvedSection ? (
              <>
                <span className="admin-page-location-section">{resolvedSection}</span>
                <span className="admin-page-location-separator">/</span>
              </>
            ) : null}
            <h1 className="admin-page-title">{title}</h1>
            {badge ? <div className="ml-1 flex items-center">{badge}</div> : null}
          </div>
          {description ? (
            <p className="admin-page-description">{description}</p>
          ) : null}
        </div>
        <div className="admin-page-actions">
          {actions}
          <AdminThemeButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5">{children}</div>
    </div>
  );
}
