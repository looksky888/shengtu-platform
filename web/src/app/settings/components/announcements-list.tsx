import {
  BellRing,
  Edit3,
  Eye,
  Image as ImageIcon,
  LoaderCircle,
  Megaphone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  formatAnnouncementDateTime,
  formatAnnouncementScheduleRange,
  getAnnouncementDisplayModeLabel,
  getAnnouncementStatusMeta,
  getAnnouncementTypeLabel,
} from "./announcements-utils";
import {
  SettingsEmptyState,
  settingsInputClassName,
  settingsListItemClassName,
} from "./settings-ui";
import type { AnnouncementsCardState } from "./use-announcements-card";

export function AnnouncementsList({
  state,
}: {
  state: AnnouncementsCardState;
}) {
  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <SettingsEmptyState
        icon={Megaphone}
        title="暂无站内公告"
        description="点击右上角「发布公告」可创建图文弹窗通知，支持指定登录页、创作台并向在线用户实时弹窗推送。"
        action={
          <Button size="sm" variant="outline" onClick={state.openCreateDialog}>
            <Plus className="size-3.5" />
            创建第一条公告
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2.5 rounded-xl border border-border/75 bg-surface-subtle/45 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={state.query}
            onChange={(event) => state.setQuery(event.target.value)}
            placeholder="搜索公告标题或正文内容…"
            aria-label="搜索公告"
            className={cn("h-9 pl-9", settingsInputClassName)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border/75 bg-surface p-0.5">
          {(["all", "enabled", "disabled"] as const).map((filter) => (
            <Button
              key={filter}
              type="button"
              size="xs"
              variant={state.statusFilter === filter ? "secondary" : "ghost"}
              className="h-7 rounded-md px-2.5 text-xs"
              onClick={() => state.setStatusFilter(filter)}
            >
              {filter === "all"
                ? `全部 (${state.items.length})`
                : filter === "enabled"
                  ? "展示中"
                  : "已停用"}
            </Button>
          ))}
        </div>
      </div>

      {state.visibleItems.length === 0 ? (
        <SettingsEmptyState
          icon={Search}
          title="没有匹配的公告"
          description="请尝试调整搜索词或切换上方状态筛选条件。"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {state.visibleItems.map((item) => {
            const isPending = state.pendingIds.has(item.id);
            const statusMeta = getAnnouncementStatusMeta(item);
            const typeLabel = getAnnouncementTypeLabel(item);
            const displayModeLabel = getAnnouncementDisplayModeLabel(item);
            const scheduleText = formatAnnouncementScheduleRange(item);

            return (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between",
                  settingsListItemClassName,
                )}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {item.title || "未命名公告"}
                    </span>
                    <Badge variant={statusMeta.variant}>
                      {statusMeta.label}
                    </Badge>
                    <Badge variant="outline">{typeLabel}</Badge>
                    <Badge variant="info">{displayModeLabel}</Badge>
                    {item.popup_version && item.popup_version > 1 ? (
                      <Badge variant="warning" className="tabular-nums">
                        弹窗 v{item.popup_version}
                      </Badge>
                    ) : null}
                  </div>

                  <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground sm:text-[13px]">
                    {item.content}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                    <span className="font-mono">{scheduleText}</span>
                    {item.last_broadcast_at ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <BellRing className="size-3" />
                        <span>
                          最近全员推送：
                          {formatAnnouncementDateTime(item.last_broadcast_at)}
                        </span>
                      </span>
                    ) : null}
                    {item.image_url ? (
                      <span className="inline-flex items-center gap-1 text-foreground/80">
                        <ImageIcon className="size-3.5" />
                        已附横幅配图
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/55 pt-3 lg:border-t-0 lg:pt-0">
                  <label className="mr-1 inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-border/75 bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground">
                    <Switch
                      size="sm"
                      checked={Boolean(item.enabled)}
                      disabled={isPending}
                      aria-label={`切换公告「${item.title || "公告"}」启用状态`}
                      onCheckedChange={() =>
                        void state.handleToggleEnabled(item)
                      }
                    />
                    <span className="min-w-[2.5rem] text-center whitespace-nowrap">
                      {isPending
                        ? "处理中"
                        : item.enabled
                          ? "已启用"
                          : "已停用"}
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.enabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => state.setBroadcastingItem(item)}
                        disabled={isPending}
                        className="border-amber-500/35 bg-amber-500/8 text-amber-800 hover:bg-amber-500/15 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/18"
                      >
                        <BellRing className="size-3.5" />
                        立即全员弹窗
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => state.setPreviewItem(item)}
                      disabled={isPending}
                    >
                      <Eye className="size-3.5" />
                      预览
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => state.openEditDialog(item)}
                      disabled={isPending}
                    >
                      <Edit3 className="size-3.5" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除公告 ${item.title || "公告"}`}
                      title="删除公告"
                      onClick={() => state.setDeletingItem(item)}
                      disabled={isPending}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
