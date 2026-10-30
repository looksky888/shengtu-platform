"use client";

import { useMemo, useState } from "react";
import {
  Clapperboard,
  CornerUpLeft,
  Film,
  Images,
  Library,
  LoaderCircle,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import { StudioStatsPopover } from "@/app/image/components/studio-stats-popover";
import { formatVideoShotTime } from "@/app/video/video-options";
import type { RecentVideoTake } from "@/app/video/video-task-storage";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

type VideoSidebarProps = {
  takes: RecentVideoTake[];
  isLoadingHistory: boolean;
  selectedTakeId: string;
  activeLiveTaskId: string;
  onStartNewShot: () => void;
  onSelectTake: (take: RecentVideoTake) => void;
  onApplyTakePrompt: (take: RecentVideoTake) => void;
  onRemoveTake: (taskId: string) => void;
  onClearHistory: () => void;
  embeddedInDialog?: boolean;
  onCollapse?: () => void;
};

export function VideoSidebar({
  takes,
  isLoadingHistory,
  selectedTakeId,
  activeLiveTaskId,
  onStartNewShot,
  onSelectTake,
  onApplyTakePrompt,
  onRemoveTake,
  onClearHistory,
  embeddedInDialog = false,
  onCollapse,
}: VideoSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const filteredTakes = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return takes;
    return takes.filter(
      (take) =>
        take.prompt.toLocaleLowerCase().includes(q) ||
        take.ratio.toLocaleLowerCase().includes(q) ||
        take.model.toLocaleLowerCase().includes(q),
    );
  }, [takes, searchQuery]);

  const removableCount = useMemo(
    () => takes.filter((item) => item.status !== "queued" && item.status !== "running").length,
    [takes],
  );

  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-2 py-0.5">
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
              {embeddedInDialog ? `创作镜头 (${takes.length})` : "创作镜头"}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="清空本地镜头记录"
                title="清空本地镜头列表（不影响云端视频库归档）"
                className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-status-danger disabled:pointer-events-none disabled:opacity-40"
                onClick={() => setClearConfirmOpen(true)}
                disabled={removableCount === 0}
              >
                <Trash2 className="size-3.5" />
              </button>
              {!embeddedInDialog && onCollapse ? (
                <button
                  type="button"
                  aria-label="收起镜头列表"
                  title="收起镜头列表"
                  className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                  onClick={onCollapse}
                >
                  <PanelLeftClose className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground shadow-2xs transition hover:bg-primary/90 active:scale-[0.985]"
            onClick={onStartNewShot}
          >
            <Plus className="size-3.5" />
            <span>新建镜头</span>
          </button>
        </div>

        {takes.length > 3 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索历史镜头…"
              aria-label="搜索历史镜头"
              className="h-8 w-full rounded-lg border border-border/75 bg-surface-muted/70 pr-7 pl-8 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/35 focus:bg-surface"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "thin-scrollbar min-h-0 flex-1 overflow-y-auto",
            embeddedInDialog
              ? "flex flex-col gap-1 pr-0"
              : "flex flex-col gap-1 py-0.5 pr-0.5",
          )}
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              <span>正在同步最近镜头…</span>
            </div>
          ) : takes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-surface-muted/35 px-3 py-6 text-center">
              <span className="flex size-8 items-center justify-center rounded-lg bg-surface text-foreground/80 ring-1 ring-border/70">
                <Sparkles className="size-4" />
              </span>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">暂无分镜记录</p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  在下方导演台输入画面描述或选择右侧分镜灵感即可开拍
                </p>
              </div>
            </div>
          ) : filteredTakes.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">
              <p>未找到匹配的镜头记录</p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg bg-surface px-2.5 text-[11px] font-medium text-foreground ring-1 ring-border/75 transition hover:bg-surface-hover"
              >
                <X className="size-3" />
                <span>清空搜索</span>
              </button>
            </div>
          ) : (
            filteredTakes.map((take, idx) => {
              const shotNumber = takes.length - takes.findIndex((item) => item.taskId === take.taskId);
              const isSelected =
                selectedTakeId === take.taskId ||
                (!selectedTakeId && activeLiveTaskId === take.taskId);
              const isRunning = take.status === "queued" || take.status === "running";
              const isSuccess = take.status === "success";
              const isError = take.status === "error";

              return (
                <div
                  key={take.taskId}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl transition-colors duration-150",
                    embeddedInDialog ? "px-3 py-2.5" : "px-2 py-2",
                    isSelected
                      ? "bg-surface-muted font-medium text-foreground ring-1 ring-border/70 before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTake(take)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 pr-11 text-left focus-visible:outline-none"
                    title={take.prompt || `镜头 #${shotNumber || idx + 1}`}
                  >
                    <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-zinc-950">
                      {isSuccess && take.videoUrl ? (
                        <>
                          <video
                            src={take.videoUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                          />
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                            <Play className="size-3 fill-white text-white" />
                          </span>
                        </>
                      ) : isRunning ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <LoaderCircle className="size-3.5 animate-spin text-emerald-400" />
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-zinc-500">
                          <Film className="size-3.5" />
                        </div>
                      )}
                      <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 py-px font-mono text-[8px] leading-tight text-zinc-100 tabular-nums">
                        {take.ratio}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate",
                          isSelected
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground/85 group-hover:text-foreground",
                          embeddedInDialog ? "text-sm" : "text-[12.5px]",
                        )}
                      >
                        {take.prompt || `第 ${shotNumber} 镜`}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground tabular-nums">
                        <span>{take.seconds}s</span>
                        <span>·</span>
                        <span>{take.resolutionName.toUpperCase()}</span>
                        {take.createdAt ? (
                          <>
                            <span>·</span>
                            <span>{formatVideoShotTime(take.createdAt)}</span>
                          </>
                        ) : null}
                      </div>
                      {isRunning ? (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-foreground/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                          <span className="size-1.5 animate-pulse rounded-full bg-status-success" />
                          <span>{take.status === "queued" ? "排队中" : "渲染中"}</span>
                        </div>
                      ) : isError ? (
                        <div className="mt-1 inline-flex items-center rounded-full bg-status-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-status-danger">
                          生成失败
                        </div>
                      ) : null}
                    </div>
                  </button>

                  <div
                    className={cn(
                      "absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5 transition",
                      embeddedInDialog
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
                    )}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onApplyTakePrompt(take);
                      }}
                      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
                      aria-label="回填提示词与参数"
                      title="回填该镜头的提示词与参数"
                    >
                      <CornerUpLeft className="size-3.5" />
                    </button>
                    {!isRunning ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveTake(take.taskId);
                        }}
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-status-danger-soft hover:text-status-danger"
                        aria-label="从列表移除"
                        title="从本地列表移除（不删除云端视频库归档）"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!embeddedInDialog ? (
          <div className="space-y-1.5 pt-1.5">
            <div className="flex items-center gap-1.5">
              <Link
                to="/video-library"
                className="inline-flex h-7.5 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-muted/75 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Library className="size-3" />
                <span>视频库</span>
              </Link>
              <Link
                to="/image-manager"
                className="inline-flex h-7.5 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-muted/75 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Images className="size-3" />
                <span>素材中心</span>
              </Link>
            </div>
            <StudioStatsPopover variant="sidebar-footer" align="start" side="top" />
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        title="确认清空本地历史镜头列表？"
        description={`将从当前设备的工作台列表中移除 ${removableCount} 条镜头记录。已归档至「视频库」的云端视频不会删除。`}
        confirmLabel="确认清空"
        destructive
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          onClearHistory();
          setClearConfirmOpen(false);
        }}
      />
    </aside>
  );
}

export function VideoModeLabel({ model }: { model: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Clapperboard className="size-3" />
      <span>{model === "grok-imagine-video" ? "Grok Video 1.0" : "Grok Video 1.5"}</span>
    </span>
  );
}
