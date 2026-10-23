"use client";

import { ArrowUpRight, Gauge, Globe } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProxyTestResult } from "@/lib/api";

import {
  SettingsHelp,
  SettingsNotice,
  settingsInlineCodeClassName,
} from "./settings-ui";

export function RestartBadge() {
  return (
    <Badge
      variant="outline"
      className="h-4.5 px-1.5 text-[10px] font-normal text-muted-foreground"
    >
      需重启生效
    </Badge>
  );
}

export function ConcurrencyOverviewStrip({
  configuredImageCeiling,
  imageWorkerCount,
  imageQueueCapacity,
  videoWorkerCount,
  videoQueueCapacity,
}: {
  configuredImageCeiling: number;
  imageWorkerCount: number;
  imageQueueCapacity: number;
  videoWorkerCount: number;
  videoQueueCapacity: number;
}) {
  return (
    <div className="rounded-xl border border-border/75 bg-surface-subtle/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground sm:text-[13px]">
          <span className="flex size-6 items-center justify-center rounded-md bg-surface-muted text-muted-foreground ring-1 ring-border/70">
            <Gauge className="size-3.5" />
          </span>
          <span>当前吞吐容量概览</span>
        </div>
        <SettingsHelp content="本地号池有效并发取「号池生图并发、图片 Worker、用户默认并发上限」中的最小值；中转站使用各自渠道独立并发与 Worker。Worker 数量与等待队列容量修改保存后需重启服务生效。" />
      </div>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/65 bg-surface px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            本地号池有效并发上限
          </div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            {configuredImageCeiling === Number.POSITIVE_INFINITY
              ? "不限制"
              : `${configuredImageCeiling} 并发`}
          </div>
        </div>
        <div className="rounded-lg border border-border/65 bg-surface px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            图片协程 / 等待队列
          </div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            {imageWorkerCount} / {imageQueueCapacity}
          </div>
        </div>
        <div className="rounded-lg border border-border/65 bg-surface px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            视频协程 / 等待队列
          </div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            {videoWorkerCount} / {videoQueueCapacity}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProxySourceStatusStrip({ proxy }: { proxy: string }) {
  const normalized = proxy.trim();
  const hasProxy = Boolean(normalized);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/75 bg-surface-subtle/45 px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground ring-1 ring-border/70">
          <Globe className="size-3.5" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground sm:text-[13px]">
              上游全局代理
            </span>
            <Badge
              variant="outline"
              className={
                hasProxy
                  ? "h-5 gap-1.5 border-status-success/25 bg-status-success-soft px-1.5 text-[10px] font-medium text-status-success"
                  : "h-5 gap-1.5 border-border/75 bg-surface px-1.5 text-[10px] font-normal text-muted-foreground"
              }
            >
              <span
                className={
                  hasProxy
                    ? "size-1.5 rounded-full bg-status-success"
                    : "size-1.5 rounded-full bg-muted-foreground/60"
                }
              />
              {hasProxy ? "已配置代理" : "未配置直连"}
            </Badge>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {hasProxy ? (
              <code className={settingsInlineCodeClassName}>{normalized}</code>
            ) : (
              "当前未启用全局代理，请求由宿主机网络直接出站"
            )}
          </div>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
        <Link to="/settings?tab=register">
          <span>前往「代理与清障」统一管理</span>
          <ArrowUpRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}

export function ProxyResult({ result }: { result: ProxyTestResult | null }) {
  if (!result) return null;
  return (
    <SettingsNotice tone={result.ok ? "success" : "danger"}>
      {result.ok
        ? `代理可用：HTTP ${result.status}，用时 ${result.latency_ms} ms`
        : `代理不可用：${result.error ?? "未知错误"}，用时 ${result.latency_ms} ms`}
    </SettingsNotice>
  );
}

export function ConfigLoadingState() {
  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-44" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <div className="grid gap-4 border-t border-border/60 pt-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
