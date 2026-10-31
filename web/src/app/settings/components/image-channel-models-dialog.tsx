"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  Coins,
  Film,
  Maximize2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createImageChannelModel,
  deleteImageChannelModel,
  discoverImageChannelModels,
  fetchImageChannelModels,
  updateImageChannelModel,
  type ImageChannel,
  type ImageChannelModel,
  type ImageChannelModelInput,
} from "@/lib/image-channel-api";
import { isVideoChannelModelId } from "@/lib/model-catalog-normalizers";
import { resetPublicModelChannelCache } from "@/lib/use-public-model-channel";
import { cn } from "@/lib/utils";

import {
  ImageChannelModelForm,
  toImageChannelModelInput,
} from "./image-channel-model-form";
import {
  CAPABILITY_SHORT_LABELS,
  CHANNEL_TYPE_LABELS,
} from "./image-channel-model-labels";
import { SettingsEmptyState } from "./settings-ui";

type ModelKindFilter = "all" | "image" | "video";

function isVideoOnlyModel(model: ImageChannelModel): boolean {
  const caps = model.capabilities ?? [];
  return caps.length === 0 && isVideoChannelModelId(model.upstream_model);
}

function CapabilityIcon({ capability }: { capability: string }) {
  if (capability === "generate") {
    return <Sparkles className="size-3 shrink-0 opacity-75" />;
  }
  if (capability === "edit") {
    return <Wand2 className="size-3 shrink-0 opacity-75" />;
  }
  if (capability === "upscale") {
    return <Maximize2 className="size-3 shrink-0 opacity-75" />;
  }
  return null;
}

function ModelPriceDisplay({ model }: { model: ImageChannelModel }) {
  if (isVideoOnlyModel(model)) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border/75 bg-surface-subtle px-2 py-0.5 text-[11px] text-muted-foreground">
        <Film className="size-3 shrink-0 opacity-70" />
        <span>按秒计费 · 遵循全局视频单价</span>
      </span>
    );
  }

  const resolutions = (model.resolutions || []).filter(Boolean);
  const costMap = model.credit_costs || {};
  const entries =
    resolutions.length > 0
      ? resolutions.map(
          (res) =>
            [
              res.toUpperCase(),
              Math.max(1, Number(costMap[res] ?? model.credit_cost) || 1),
            ] as const,
        )
      : Object.entries(costMap).map(
          ([res, cost]) =>
            [res.toUpperCase(), Math.max(1, Number(cost) || 1)] as const,
        );

  if (entries.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
        <Coins className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>{model.credit_cost} 积分/张</span>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map(([tier, cost]) => (
        <span
          key={tier}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[11px] tabular-nums text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
        >
          <span className="font-semibold text-amber-700/85 dark:text-amber-300/85">
            {tier}
          </span>
          <span className="opacity-45">·</span>
          <span className="font-semibold">{cost}</span>
          <span className="text-[10px] opacity-80">积分</span>
        </span>
      ))}
    </div>
  );
}

export function ImageChannelModelsDialog({
  channel,
  open,
  onOpenChange,
  onChanged,
}: {
  channel: ImageChannel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [models, setModels] = useState<ImageChannelModel[]>([]);
  const [editing, setEditing] = useState<
    ImageChannelModel | null | undefined
  >();
  const [deletingModel, setDeletingModel] =
    useState<ImageChannelModel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionForForm, setSuggestionForForm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ModelKindFilter>("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const load = useCallback(async () => {
    if (!channel) return;
    setLoading(true);
    try {
      const response = await fetchImageChannelModels(channel.id);
      setModels(response.models || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "加载渠道模型失败",
      );
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    if (open) {
      setEditing(undefined);
      setDeletingModel(null);
      setSuggestions([]);
      setSuggestionForForm("");
      setSearchQuery("");
      setKindFilter("all");
      void load();
    }
  }, [load, open]);

  const save = async (input: ImageChannelModelInput) => {
    if (!channel) return;
    setSaving(true);
    try {
      if (editing) {
        await updateImageChannelModel(channel.id, editing.id, input);
      } else {
        await createImageChannelModel(channel.id, input);
      }
      toast.success(editing ? "渠道模型已更新" : "渠道模型已添加");
      setEditing(undefined);
      setSuggestionForForm("");
      resetPublicModelChannelCache();
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存模型失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleModelEnabled = async (
    model: ImageChannelModel,
    nextEnabled: boolean,
  ) => {
    if (!channel || togglingId) return;
    setTogglingId(model.id);
    try {
      const updated = await updateImageChannelModel(
        channel.id,
        model.id,
        toImageChannelModelInput(model, { enabled: nextEnabled }),
      );
      setModels((current) =>
        current.map((item) => (item.id === model.id ? updated : item)),
      );
      resetPublicModelChannelCache();
      toast.success(
        `${model.display_name || model.upstream_model} 已${nextEnabled ? "启用" : "停用"}`,
      );
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换模型状态失败");
    } finally {
      setTogglingId(null);
    }
  };

  const discover = async () => {
    if (!channel) return;
    setDiscovering(true);
    try {
      const response = await discoverImageChannelModels(channel.id);
      const discovered = response.models || [];
      setSuggestions(discovered);
      toast.success(
        discovered.length > 0
          ? `已拉取 ${discovered.length} 个上游候选模型，点击候选标签即可快速配置`
          : "上游接口返回成功，但暂无可发现的模型列表",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "拉取上游模型失败",
      );
    } finally {
      setDiscovering(false);
    }
  };

  const confirmRemove = async () => {
    if (!channel || !deletingModel) return;
    setDeleting(true);
    try {
      await deleteImageChannelModel(channel.id, deletingModel.id);
      toast.success("模型已移除");
      setDeletingModel(null);
      resetPublicModelChannelCache();
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除模型失败");
    } finally {
      setDeleting(false);
    }
  };

  const enabledModelsCount = useMemo(
    () => models.filter((item) => item.enabled).length,
    [models],
  );
  const videoModelsCount = useMemo(
    () => models.filter((item) => isVideoOnlyModel(item)).length,
    [models],
  );
  const imageModelsCount = models.length - videoModelsCount;

  const modelByUpstream = useMemo(() => {
    const map = new Map<string, ImageChannelModel>();
    for (const item of models) {
      map.set(item.upstream_model.trim().toLowerCase(), item);
    }
    return map;
  }, [models]);

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return models.filter((model) => {
      const videoOnly = isVideoOnlyModel(model);
      if (kindFilter === "image" && videoOnly) return false;
      if (kindFilter === "video" && !videoOnly) return false;
      if (!query) return true;
      return (
        (model.display_name || "").toLowerCase().includes(query) ||
        model.upstream_model.toLowerCase().includes(query)
      );
    });
  }, [kindFilter, models, searchQuery]);

  const isEditingView = editing !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] w-[min(96vw,960px)] max-w-[960px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="shrink-0 border-b border-border/75 bg-surface-raised px-6 py-4 pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base font-semibold">
              {channel?.name || "渠道"} · 模型与单价管理
            </DialogTitle>
            {channel?.type ? (
              <Badge
                variant="outline"
                className="border-border/75 bg-surface-subtle text-[11px] font-normal text-muted-foreground"
              >
                {CHANNEL_TYPE_LABELS[channel.type] || channel.type}
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="gap-1.5 border-border/75 bg-surface-subtle tabular-nums text-muted-foreground"
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  enabledModelsCount > 0
                    ? "bg-status-success"
                    : "bg-muted-foreground/55",
                )}
              />
              <span>
                {enabledModelsCount} / {models.length} 已启用
              </span>
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {isEditingView
              ? "配置上游模型映射、创作能力及分辨率积分单价，保存后实时同步前台创作台"
              : "管理该渠道对外暴露的生图/修图及关联视频模型、分辨率规格与积分价格"}
          </DialogDescription>
        </DialogHeader>

        <SectionErrorBoundary
          compact
          resetKey={`${channel?.id ?? "none"}:${open}:${editing === undefined ? "list" : editing?.id ?? "new"}`}
          title="渠道模型管理渲染异常"
        >
          {!isEditingView ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b border-border/65 bg-surface-subtle/40 px-6 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setSuggestionForForm("");
                      setEditing(null);
                    }}
                    className="h-8 gap-1.5 px-3 text-xs"
                  >
                    <Plus className="size-3.5" />
                    <span>新增模型</span>
                  </Button>
                  {channel?.type === "openai_compatible" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={discovering}
                      disabled={discovering}
                      onClick={() => void discover()}
                      className="h-8 gap-1.5 px-3 text-xs"
                    >
                      <RefreshCw className="size-3.5" />
                      <span>从上游拉取模型</span>
                    </Button>
                  ) : null}
                </div>

                {models.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {videoModelsCount > 0 && imageModelsCount > 0 ? (
                      <div className="inline-flex h-8 items-center rounded-lg border border-border/75 bg-surface p-0.5 text-xs">
                        {(
                          [
                            { id: "all", label: `全部 ${models.length}` },
                            { id: "image", label: `图片 ${imageModelsCount}` },
                            { id: "video", label: `视频 ${videoModelsCount}` },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setKindFilter(tab.id)}
                            className={cn(
                              "h-6.5 whitespace-nowrap rounded-md px-2.5 text-[11px] font-medium tabular-nums transition-colors",
                              kindFilter === tab.id
                                ? "bg-foreground text-background shadow-2xs"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="relative w-48 sm:w-56">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="搜索模型名称或 ID..."
                        className="h-8 bg-surface pr-7 pl-8 text-xs"
                      />
                      {searchQuery ? (
                        <button
                          type="button"
                          aria-label="清空搜索"
                          onClick={() => setSearchQuery("")}
                          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {suggestions.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-border/80 bg-surface-subtle/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">
                        已发现 {suggestions.length} 个上游候选模型（点击未挂载项可直接新增，点击已挂载项可编辑）：
                      </span>
                      <button
                        type="button"
                        onClick={() => setSuggestions([])}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        收起
                      </button>
                    </div>
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                      {suggestions.map((suggestion) => {
                        const existing = modelByUpstream.get(
                          suggestion.trim().toLowerCase(),
                        );
                        return (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => {
                              if (existing) {
                                setSuggestionForForm("");
                                setEditing(existing);
                              } else {
                                setSuggestionForForm(suggestion);
                                setEditing(null);
                              }
                            }}
                            className={cn(
                              "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 font-mono text-xs transition-colors",
                              existing
                                ? "border-status-success/30 bg-status-success-soft/65 text-foreground hover:bg-status-success-soft"
                                : "border-border/80 bg-surface text-foreground hover:border-border-strong hover:bg-surface-hover",
                            )}
                          >
                            {existing ? (
                              <Check className="size-3 shrink-0 text-status-success" />
                            ) : (
                              <Plus className="size-3 shrink-0 text-muted-foreground" />
                            )}
                            <span>{suggestion}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {loading ? (
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                  </div>
                ) : models.length === 0 ? (
                  <SettingsEmptyState
                    icon={Boxes}
                    title="当前渠道尚未挂载模型"
                    description="点击上方「新增模型」或「从上游拉取模型」后，模型即可同步出现在前台创作台中。"
                  />
                ) : filteredModels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/75 bg-surface-subtle/35 py-10 text-center">
                    <p className="text-sm font-medium text-foreground">
                      未找到匹配的模型条目
                    </p>
                    <p className="text-xs text-muted-foreground">
                      请尝试更换搜索关键词或切换模型类型筛选条件
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setKindFilter("all");
                      }}
                      className="mt-1 h-7 text-xs"
                    >
                      重置筛选
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/75 bg-surface">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-surface-subtle/55 hover:bg-surface-subtle/55">
                          <TableHead className="min-w-[230px]">
                            模型名称 / 上游 ID
                          </TableHead>
                          <TableHead className="min-w-[185px]">
                            支持能力与规格
                          </TableHead>
                          <TableHead className="min-w-[195px]">
                            积分定价
                          </TableHead>
                          <TableHead className="w-[132px] whitespace-nowrap">
                            启用状态
                          </TableHead>
                          <TableHead className="w-[92px] text-right whitespace-nowrap">
                            操作
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredModels.map((model) => {
                          const capabilities = model.capabilities ?? [];
                          const videoOnly = isVideoOnlyModel(model);
                          const specSummary = !videoOnly
                            ? [
                                (model.resolutions || [])
                                  .map((item) => item.toUpperCase())
                                  .join("/"),
                                (model.formats || [])
                                  .map((item) => item.toUpperCase())
                                  .join(", "),
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : "";
                          const rowToggling = togglingId === model.id;

                          return (
                            <TableRow
                              key={model.id}
                              className={cn(
                                "transition-colors",
                                !model.enabled && "opacity-70",
                              )}
                            >
                              <TableCell className="align-middle">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-foreground">
                                    {model.display_name || model.upstream_model}
                                  </span>
                                  <span className="rounded bg-surface-subtle px-1.5 py-0.2 font-mono text-[10px] tabular-nums text-muted-foreground">
                                    #{model.sort}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-1">
                                  <code className="inline-block max-w-[260px] truncate whitespace-nowrap rounded-md border border-border/60 bg-surface-muted/85 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                    {model.upstream_model}
                                  </code>
                                  <CopyButton
                                    value={model.upstream_model}
                                    title="复制上游模型 ID"
                                    toastMessage="已复制模型 ID"
                                    className="size-6 shrink-0 rounded text-muted-foreground hover:text-foreground"
                                  />
                                </div>
                              </TableCell>

                              <TableCell className="align-middle">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {capabilities.length > 0 ? (
                                    capabilities.map((cap) => (
                                      <Badge
                                        key={cap}
                                        variant="secondary"
                                        className="gap-1 px-2 py-0.5 text-[11px] font-medium"
                                      >
                                        <CapabilityIcon capability={cap} />
                                        <span>
                                          {CAPABILITY_SHORT_LABELS[cap] || cap}
                                        </span>
                                      </Badge>
                                    ))
                                  ) : videoOnly ? (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 border-border/80 bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-foreground"
                                    >
                                      <Film className="size-3 shrink-0 text-muted-foreground" />
                                      <span>视频生成</span>
                                    </Badge>
                                  ) : (
                                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                                      未配置图片能力
                                    </span>
                                  )}
                                </div>
                                {specSummary ? (
                                  <div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
                                    {specSummary}
                                  </div>
                                ) : null}
                              </TableCell>

                              <TableCell className="align-middle">
                                <ModelPriceDisplay model={model} />
                              </TableCell>

                              <TableCell className="align-middle whitespace-nowrap">
                                <div className="inline-flex items-center gap-2 whitespace-nowrap">
                                  <Switch
                                    size="sm"
                                    checked={model.enabled}
                                    disabled={rowToggling}
                                    aria-label={`切换 ${model.display_name || model.upstream_model} 启用状态`}
                                    onCheckedChange={(checked) =>
                                      void toggleModelEnabled(model, checked)
                                    }
                                  />
                                  <span
                                    className={cn(
                                      "whitespace-nowrap text-xs font-medium",
                                      model.enabled
                                        ? "text-status-success"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {model.enabled ? "已启用" : "已停用"}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell className="align-middle whitespace-nowrap">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label="编辑模型"
                                    title="编辑模型与单价"
                                    onClick={() => setEditing(model)}
                                    className="size-7.5 text-muted-foreground hover:text-foreground"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label="删除模型"
                                    title="移除模型"
                                    onClick={() => setDeletingModel(model)}
                                    className="size-7.5 text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <ImageChannelModelForm
                model={editing}
                saving={saving}
                suggestions={suggestions}
                existingUpstreamModels={models.map(
                  (item) => item.upstream_model,
                )}
                initialUpstreamModel={suggestionForForm}
                onCancel={() => {
                  setSuggestionForForm("");
                  setEditing(undefined);
                }}
                onSave={save}
              />
            </div>
          )}
        </SectionErrorBoundary>

        <ConfirmDialog
          open={Boolean(deletingModel)}
          title="确认移除该渠道模型？"
          description={
            deletingModel
              ? `即将从渠道「${channel?.name ?? ""}」中移除模型「${deletingModel.display_name || deletingModel.upstream_model}」，创作台将不再展示该选项。`
              : ""
          }
          confirmLabel="确认删除"
          destructive
          pending={deleting}
          onClose={() => setDeletingModel(null)}
          onConfirm={() => void confirmRemove()}
        />
      </DialogContent>
    </Dialog>
  );
}
