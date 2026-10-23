"use client";

import { PageHeader } from "@/components/page-header";
import { AlertTriangle } from "lucide-react";

export function SettingsHeader({ dirtyModules = [] }: { dirtyModules?: string[] }) {
  return (
    <PageHeader
      eyebrow="系统与治理"
      title="系统设置"
      description="集中管理平台基础参数、生图路由、邮箱风控、媒体存储与宿主机平滑升级。"
      actions={dirtyModules.length ? (
        <div role="status" className="inline-flex items-center gap-2 rounded-lg border border-status-warning/30 bg-status-warning-soft px-3 py-1.5 text-xs font-medium text-status-warning">
          <AlertTriangle className="size-3.5" />未保存：{dirtyModules.join("、")}
        </div>
      ) : null}
    />
  );
}
