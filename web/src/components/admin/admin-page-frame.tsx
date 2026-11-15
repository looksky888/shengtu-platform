"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export function AdminPageFrame({
  section,
  groupLabel,
  title,
  description,
  badge,
  back,
  actions,
  embedded = false,
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
  embedded?: boolean;
  scrollable?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (embedded) {
    const hasEmbeddedToolbar = Boolean(back || badge || actions);
    return (
      <div
        data-admin-embedded=""
        className={cn("flex min-h-0 flex-col gap-4", className)}
      >
        {hasEmbeddedToolbar ? (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {back || badge ? (
              <div className="admin-page-location">
                {back ? (
                  <button
                    type="button"
                    onClick={back.onClick}
                    aria-label={back.label}
                    title={back.label}
                    className="admin-icon-button mr-1 !size-7.5 !rounded-xl"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                ) : null}
                {back ? (
                  <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                ) : null}
                {badge ? <div className="flex items-center">{badge}</div> : null}
              </div>
            ) : null}
            {actions ? (
              <div className="admin-page-actions ml-auto">{actions}</div>
            ) : null}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>
      </div>
    );
  }

  const resolvedSection = section ?? groupLabel;
  return (
    <div
      data-admin-root=""
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
        {actions ? (
          <div className="admin-page-actions">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5">{children}</div>
    </div>
  );
}
