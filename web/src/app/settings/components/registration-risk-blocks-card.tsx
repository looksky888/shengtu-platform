"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, RefreshCw, Search, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteRegistrationRiskBlock,
  fetchRegistrationRiskBlocks,
  type RegistrationRiskBlock,
} from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  SettingsCard,
  SettingsEmptyState,
  settingsInlineCodeClassName,
  settingsInputClassName,
  settingsListItemClassName,
} from "./settings-ui";

const kindLabels: Record<string, string> = {
  device: "设备指纹",
  ip: "来源 IP",
  ip_device: "IP + 设备",
};

export function RegistrationRiskBlocksCard({
  refreshSignal = 0,
  onCountChange,
}: {
  refreshSignal?: number;
  onCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<RegistrationRiskBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasingId, setReleasingId] = useState("");
  const [query, setQuery] = useState("");
  const [pendingRelease, setPendingRelease] =
    useState<RegistrationRiskBlock | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchRegistrationRiskBlocks();
        setItems(data.items);
        onCountChange?.(data.items.length);
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "加载封禁记录失败"
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [onCountChange]
  );

  useEffect(() => {
    void load(refreshSignal > 0);
  }, [load, refreshSignal]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => {
      const kindText = (kindLabels[item.kind] || item.kind).toLowerCase();
      return (
        item.key.toLowerCase().includes(keyword) ||
        item.reason.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword) ||
        kindText.includes(keyword)
      );
    });
  }, [items, query]);

  const handleRelease = async (item: RegistrationRiskBlock) => {
    setReleasingId(item.id);
    try {
      await deleteRegistrationRiskBlock(item.id);
      setItems((current) => {
        const next = current.filter((value) => value.id !== item.id);
        onCountChange?.(next.length);
        return next;
      });
      setPendingRelease(null);
      toast.success("已解除该条注册封禁");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "解除封禁失败");
    } finally {
      setReleasingId("");
    }
  };

  return (
    <>
      <SettingsCard
        icon={Ban}
        title="生效中的注册封禁记录"
        description="实时展示触发风控规则被拦截的 IP 与设备指纹，支持检索与人工解封"
        tone="slate"
        meta={
          <Badge
            variant="outline"
            className={cn(
              "h-5 px-2 text-[11px] tabular-nums",
              items.length > 0
                ? "border-status-warning/25 bg-status-warning-soft font-medium text-status-warning"
                : "border-border/75 bg-surface-subtle text-muted-foreground"
            )}
          >
            {items.length > 0 ? `${items.length} 条生效中` : "0 条封禁"}
          </Badge>
        }
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="h-8 gap-1.5 px-2.5 text-xs"
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
            />
            <span>刷新</span>
          </Button>
        }
      >
        {loading && items.length === 0 ? (
          <div className="space-y-2.5 py-1">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : items.length === 0 ? (
          <SettingsEmptyState
            icon={Ban}
            title="当前暂无生效封禁"
            description="触发设备指纹、单 IP 或组合频控阈值后，拦截记录将实时出现在此处。"
          />
        ) : (
          <div className="space-y-3">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 IP / 设备指纹 / 规则代码 / 原因…"
                className={cn(settingsInputClassName, "h-8.5 pl-8.5 pr-16 text-xs")}
              />
              <div className="absolute right-2 flex items-center gap-1">
                {query ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="清空搜索"
                    onClick={() => setQuery("")}
                    className="size-6 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </Button>
                ) : null}
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {filteredItems.length}/{items.length}
                </span>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <SettingsEmptyState
                icon={Search}
                title="未找到匹配的封禁记录"
                description={`没有包含「${query.trim()}」的 IP、设备指纹或原因记录。`}
              />
            ) : (
              <div className="max-h-[30rem] space-y-2.5 overflow-y-auto pr-1">
                {filteredItems.map((item) => (
                  <div key={item.id} className={settingsListItemClassName}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-[11px]"
                          >
                            {kindLabels[item.kind] || item.kind}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {item.code}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <code className={settingsInlineCodeClassName}>
                            {item.key}
                          </code>
                        </div>
                        <div className="text-xs leading-5 text-muted-foreground">
                          {item.reason} · 到期时间 {formatDate(item.expires_at)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={releasingId === item.id}
                        disabled={Boolean(releasingId)}
                        onClick={() => setPendingRelease(item)}
                        className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                      >
                        <ShieldOff className="size-3.5" />
                        <span>解除封禁</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={Boolean(pendingRelease)}
        tone="warning"
        title="确认解除该条注册封禁？"
        description={
          pendingRelease ? (
            <span>
              即将提前释放对{" "}
              <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {pendingRelease.key}
              </code>{" "}
              的注册拦截（原因：{pendingRelease.reason}）。解除后该来源可立即重新提交注册请求。
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="确认解除封禁"
        pendingLabel="解除中…"
        pending={Boolean(pendingRelease && releasingId === pendingRelease.id)}
        onClose={() => setPendingRelease(null)}
        onConfirm={() => {
          if (pendingRelease) {
            void handleRelease(pendingRelease);
          }
        }}
      />
    </>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
}
