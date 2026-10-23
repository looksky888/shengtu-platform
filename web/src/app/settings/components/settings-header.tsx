"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export function SettingsHeader({
  dirtyModules = [],
  isRefreshing = false,
  onRefresh,
}: {
  dirtyModules?: string[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <PageHeader
      eyebrow="系统与治理"
      title="系统设置"
      description="集中管理平台基础参数、生图路由、邮箱风控、媒体存储与宿主机平滑升级。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {dirtyModules.length > 0 ? (
            <div
              role="status"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-status-warning/30 bg-status-warning-soft px-3 text-xs font-medium text-status-warning"
            >
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>未保存：{dirtyModules.join("、")}</span>
            </div>
          ) : null}
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isRefreshing}
              onClick={onRefresh}
              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
            >
              <RefreshCw className="size-3.5" />
              <span>刷新当前页</span>
            </Button>
          ) : null}
        </div>
      }
    />
  );
}
