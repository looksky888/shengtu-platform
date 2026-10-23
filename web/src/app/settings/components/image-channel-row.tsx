"use client";

import { Boxes, Gauge, KeyRound, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Switch } from "@/components/ui/switch";
import type { ImageChannel } from "@/lib/image-channel-api";
import { cn } from "@/lib/utils";

import { settingsListItemClassName } from "./settings-ui";

const typeLabels: Record<ImageChannel["type"], string> = {
  account_pool: "本地 GPT 号池",
  grok_runtime: "本地 Grok 号池（含视频）",
  openai_compatible: "OpenAI 兼容中转站",
};

export function ImageChannelRow({
  channel,
  toggling = false,
  onToggleEnabled,
  onEdit,
  onModels,
  onDelete,
}: {
  channel: ImageChannel;
  toggling?: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onModels: () => void;
  onDelete: () => void;
}) {
  const isRelay = channel.type === "openai_compatible";

  return (
    <div
      className={cn(
        settingsListItemClassName,
        "grid gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.9fr)_auto] lg:items-center"
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {channel.name}
          </span>
          {channel.alias ? (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground"
            >
              {channel.alias}
            </Badge>
          ) : null}
          {channel.system ? (
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] font-normal"
            >
              系统内置
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className={cn(
              "h-5 gap-1.5 px-2 text-[11px]",
              channel.enabled
                ? "border-status-success/25 bg-status-success-soft font-medium text-status-success"
                : "border-border/75 bg-surface text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                channel.enabled
                  ? "bg-status-success"
                  : "bg-muted-foreground/55"
              )}
            />
            {channel.enabled ? "已启用" : "已停用"}
          </Badge>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{typeLabels[channel.type]}</span>
          {channel.base_url ? (
            <>
              <span aria-hidden="true">·</span>
              <code className="max-w-full truncate rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {channel.base_url}
              </code>
              <CopyButton
                value={channel.base_url}
                title="复制 Base URL"
                toastMessage="已复制渠道 Base URL"
                className="size-6 rounded text-muted-foreground hover:text-foreground"
              />
            </>
          ) : null}
          {isRelay ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                <KeyRound className="size-3" />
                {channel.api_key_configured
                  ? channel.api_key_masked || "密钥已配置"
                  : "未配置密钥"}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap">
          <Boxes className="size-3.5 shrink-0" />
          <span>
            启用模型{" "}
            <strong className="font-medium text-foreground">
              {channel.enabled_models}
            </strong>{" "}
            / {channel.model_count}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap">
          <Gauge className="size-3.5 shrink-0" />
          <span>
            并发 {channel.max_concurrency} · 超时 {channel.timeout_seconds}s
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 lg:justify-end lg:border-t-0 lg:pt-0">
        <div className="flex items-center gap-2 pr-1">
          <span className="text-[11px] text-muted-foreground">
            {channel.enabled ? "运行中" : "已停用"}
          </span>
          <Switch
            size="sm"
            aria-label={`切换渠道 ${channel.name} 启用状态`}
            checked={channel.enabled}
            disabled={toggling}
            onCheckedChange={onToggleEnabled}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onModels}
            className="h-8 gap-1.5 px-2.5 text-xs"
          >
            <Boxes className="size-3.5" />
            <span>模型管理</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="编辑渠道参数"
            title="编辑渠道参数"
            onClick={onEdit}
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </Button>
          {!channel.system ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="删除渠道"
              title="删除渠道"
              onClick={onDelete}
              className="size-8 text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
