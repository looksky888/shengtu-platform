"use client";

import { PageHeader } from "@/components/page-header";
import { AlertTriangle } from "lucide-react";

export function SettingsHeader({ dirtyModules = [] }: { dirtyModules?: string[] }) {
  return (
    <PageHeader
      eyebrow="系统"
      title="设置"
      actions={dirtyModules.length ? (
        <div role="status" className="inline-flex items-center gap-2 rounded-full border border-status-warning/30 bg-status-warning-soft px-3 py-2 text-xs font-medium text-status-warning">
          <AlertTriangle className="size-3.5" />未保存：{dirtyModules.join("、")}
        </div>
      ) : null}
    />
  );
}
