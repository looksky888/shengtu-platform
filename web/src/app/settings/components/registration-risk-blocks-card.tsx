"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldOff,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteRegistrationRiskBlock,
  fetchRegistrationRiskBlocks,
  type RegistrationRiskBlock,
} from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

import {
  SettingsCard,
  SettingsEmptyState,
  settingsInputClassName,
} from "./settings-ui";

const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(1);
  const [pendingRelease, setPendingRelease] =
    useState<RegistrationRiskBlock | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchRegistrationRiskBlocks();
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setItems(nextItems);
        onCountChange?.(nextItems.length);
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "加载封禁记录失败",
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [onCountChange],
  );

  useEffect(() => {
    void load(refreshSignal > 0);
  }, [load, refreshSignal]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => {
      const kindText = (kindLabels[item.kind] || item.kind || "").toLowerCase();
      return (
        String(item.key ?? "").toLowerCase().includes(keyword) ||
        String(item.reason ?? "").toLowerCase().includes(keyword) ||
        String(item.code ?? "").toLowerCase().includes(keyword) ||
        kindText.includes(keyword)
      );
    });
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

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
                : "border-border/75 bg-surface-subtle text-muted-foreground",
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
          <div className="space-y-2 py-1">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : items.length === 0 ? (
          <SettingsEmptyState
            icon={Ban}
            title="当前暂无生效封禁"
            description="触发设备指纹、单 IP 或组合频控阈值后，拦截记录将实时出现在此处。"
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative flex w-full max-w-md items-center">
                <Search className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索 IP / 设备指纹 / 规则代码 / 原因…"
                  className={cn(
                    settingsInputClassName,
                    "h-8.5 pl-8.5 pr-16 text-xs",
                  )}
                />
                <div className="absolute right-2 flex items-center gap-1">
                  {query ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="清空搜索"
                      onClick={() => {
                        setQuery("");
                        setPage(1);
                      }}
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
            </div>

            {filteredItems.length === 0 ? (
              <SettingsEmptyState
                icon={Search}
                title="未找到匹配的封禁记录"
                description={`没有包含「${query.trim()}」的 IP、设备指纹或原因记录。`}
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-border/75 bg-surface">
                  <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/70 bg-surface-subtle/60 text-[11px] font-medium text-muted-foreground">
                        <th className="px-3.5 py-2.5 whitespace-nowrap">
                          拦截维度
                        </th>
                        <th className="px-3.5 py-2.5">命中标识</th>
                        <th className="px-3.5 py-2.5">规则与原因</th>
                        <th className="px-3.5 py-2.5 whitespace-nowrap">
                          到期时间
                        </th>
                        <th className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {pagedItems.map((item) => (
                        <tr
                          key={item.id}
                          className="transition-colors hover:bg-surface-hover/40"
                        >
                          <td className="px-3.5 py-2.5 align-middle whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className="h-5 px-1.5 text-[11px] font-medium"
                            >
                              {kindLabels[item.kind] || item.kind}
                            </Badge>
                          </td>
                          <td className="max-w-[240px] px-3.5 py-2.5 align-middle">
                            <div className="flex items-center gap-1.5">
                              <code className="truncate rounded bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-foreground ring-1 ring-border/60">
                                {item.key}
                              </code>
                              <CopyButton
                                value={item.key}
                                toastMessage="已复制命中标识"
                                className="size-6 shrink-0 rounded text-muted-foreground hover:text-foreground"
                              />
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 align-middle">
                            <div className="space-y-0.5">
                              <div className="text-xs text-foreground">
                                {item.reason}
                              </div>
                              {item.code ? (
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  {item.code}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 align-middle font-mono text-[11px] whitespace-nowrap tabular-nums text-muted-foreground">
                            {formatDateTime(item.expires_at)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right align-middle whitespace-nowrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              loading={releasingId === item.id}
                              disabled={Boolean(releasingId)}
                              onClick={() => setPendingRelease(item)}
                              className="h-7 gap-1 px-2.5 text-xs"
                            >
                              <ShieldOff className="size-3.5" />
                              <span>解除封禁</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredItems.length > PAGE_SIZE ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      第 {safePage} / {totalPages} 页 · 共{" "}
                      {filteredItems.length} 条记录
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safePage <= 1}
                        onClick={() =>
                          setPage((current) => Math.max(1, current - 1))
                        }
                        className="h-7 gap-1 px-2.5 text-xs"
                      >
                        <ChevronLeft className="size-3.5" />
                        <span>上一页</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safePage >= totalPages}
                        onClick={() =>
                          setPage((current) =>
                            Math.min(totalPages, current + 1),
                          )
                        }
                        className="h-7 gap-1 px-2.5 text-xs"
                      >
                        <span>下一页</span>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
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
