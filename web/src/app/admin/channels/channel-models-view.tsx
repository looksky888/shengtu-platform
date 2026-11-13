"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coins,
  Film,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  ImageChannelModelForm,
  toImageChannelModelInput,
} from "@/app/settings/components/image-channel-model-form";
import {
  CAPABILITY_SHORT_LABELS,
  CHANNEL_TYPE_LABELS,
} from "@/app/settings/components/image-channel-model-labels";
import {
  AdminPageFrame,
  AdminSlideDrawer,
  AdminStatTile,
  AdminStatusBadge,
} from "@/components/admin";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

type ModelKindFilter = "all" | "image" | "video";

function isVideoOnlyModel(model: ImageChannelModel): boolean {
  const caps = model.capabilities ?? [];
  return caps.length === 0 && isVideoChannelModelId(model.upstream_model);
}

function renderTierPricing(model: ImageChannelModel) {
  if (isVideoOnlyModel(model)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-2 py-0.5 text-[11.5px] text-[var(--admin-text-muted)]">
        <Film className="size-3" />
        按秒计费 · 全局视频单价
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
      <span className="inline-flex items-center gap-1 font-mono text-[12px] tabular-nums text-[var(--admin-text)]">
        <Coins className="size-3 text-[var(--admin-warning)]" />
        {model.credit_cost} 积分 / 张
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map(([tier, cost]) => (
        <span
          key={tier}
          className="inline-flex items-center gap-1 rounded border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[var(--admin-text)]"
        >
          <span className="text-[var(--admin-text-muted)]">{tier}</span>
          <span>{cost}</span>
        </span>
      ))}
    </div>
  );
}

export function ChannelModelsView({
  channel,
  onBack,
  onChanged,
}: {
  channel: ImageChannel;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [models, setModels] = useState<ImageChannelModel[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ImageChannelModel | null>(null);
  const [initialUpstreamModel, setInitialUpstreamModel] = useState("");
  const [deletingModel, setDeletingModel] = useState<ImageChannelModel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ModelKindFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const loadModels = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetchImageChannelModels(channel.id);
      setModels(response.models || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载渠道模型失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const res = await discoverImageChannelModels(channel.id);
      const list = res.models || [];
      setSuggestions(list);
      toast.success(
        list.length > 0
          ? `已从上游同步探测到 ${list.length} 个候选模型`
          : "上游返回模型列表为空",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步上游模型失败");
    } finally {
      setDiscovering(false);
    }
  };

  const openCreateDrawer = (prefillUpstream = "") => {
    setEditingModel(null);
    setInitialUpstreamModel(prefillUpstream);
    setDrawerOpen(true);
  };

  const openEditDrawer = (model: ImageChannelModel) => {
    setEditingModel(model);
    setInitialUpstreamModel("");
    setDrawerOpen(true);
  };

  const handleSaveModel = async (input: ImageChannelModelInput) => {
    setSaving(true);
    try {
      if (editingModel) {
        await updateImageChannelModel(channel.id, editingModel.id, input);
        toast.success(`模型「${input.display_name || input.upstream_model}」已更新`);
      } else {
        await createImageChannelModel(channel.id, input);
        toast.success(`模型「${input.display_name || input.upstream_model}」已添加`);
      }
      resetPublicModelChannelCache();
      setDrawerOpen(false);
      await loadModels(true);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存模型失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleModel = async (model: ImageChannelModel, nextEnabled: boolean) => {
    setTogglingId(model.id);
    try {
      await updateImageChannelModel(
        channel.id,
        model.id,
        toImageChannelModelInput(model, { enabled: nextEnabled }),
      );
      setModels((prev) =>
        prev.map((m) => (m.id === model.id ? { ...m, enabled: nextEnabled } : m)),
      );
      resetPublicModelChannelCache();
      await onChanged();
      toast.success(nextEnabled ? "模型已启用" : "模型已停用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换状态失败");
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingModel) return;
    setDeleting(true);
    try {
      await deleteImageChannelModel(channel.id, deletingModel.id);
      toast.success(`模型「${deletingModel.display_name || deletingModel.upstream_model}」已移除`);
      setDeletingModel(null);
      resetPublicModelChannelCache();
      await loadModels(true);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除模型失败");
    } finally {
      setDeleting(false);
    }
  };

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return models.filter((model) => {
      const video = isVideoOnlyModel(model);
      if (kindFilter === "video" && !video) return false;
      if (kindFilter === "image" && video) return false;
      if (!q) return true;
      return `${model.display_name || ""} ${model.upstream_model || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [kindFilter, models, searchQuery]);

  const existingUpstreamSet = useMemo(
    () => new Set(models.map((m) => m.upstream_model.toLowerCase())),
    [models],
  );
  const unaddedSuggestions = useMemo(
    () => suggestions.filter((id) => !existingUpstreamSet.has(id.toLowerCase())),
    [existingUpstreamSet, suggestions],
  );

  const enabledCount = models.filter((m) => m.enabled).length;
  const videoCount = models.filter((m) => isVideoOnlyModel(m)).length;

  return (
    <AdminPageFrame
      groupLabel="算力与号池 / 系统渠道"
      title={`${channel.name} · 模型与单价管理`}
      description={`管理渠道（${CHANNEL_TYPE_LABELS[channel.type] || channel.type}）下挂载的生图/视频模型、支持画幅与 1K / 2K / 4K 阶梯积分计价。`}
      back={{ label: "返回系统渠道", onClick: onBack }}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {channel.type === "openai_compatible" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={discovering}
              onClick={() => void handleDiscover()}
            >
              <RefreshCw className={cn("size-3.5", discovering && "animate-spin")} />
              同步上游模型
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => openCreateDrawer()}
          >
            <Plus className="size-3.5" />
            + 新增模型
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="已配置模型总数"
          value={models.length}
          hint={`生图 ${models.length - videoCount} · 视频 ${videoCount}`}
        />
        <AdminStatTile
          label="当前启用模型"
          value={`${enabledCount} / ${models.length}`}
          tone={enabledCount > 0 ? "success" : "default"}
          hint="启用后即时同步至前台模型选择器"
        />
        <AdminStatTile
          label="渠道并发 / 超时"
          value={`${channel.max_concurrency} 路 · ${channel.timeout_seconds}s`}
          hint={channel.base_url || "内置系统供给通道"}
        />
      </div>

      {unaddedSuggestions.length > 0 ? (
        <div className="rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--admin-text)]">
              <Sparkles className="size-3.5 text-[var(--admin-info)]" />
              发现 {unaddedSuggestions.length} 个尚未挂载的上游候选模型（点击即可打开右侧抽屉预填新增）
            </span>
            <button
              type="button"
              onClick={() => setSuggestions([])}
              className="text-[11px] text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]"
            >
              收起
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unaddedSuggestions.slice(0, 32).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => openCreateDrawer(candidate)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-2 font-mono text-[11.5px] text-[var(--admin-text)] hover:border-[var(--admin-border-strong)]"
              >
                <Plus className="size-3 text-[var(--admin-text-muted)]" />
                {candidate}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64 max-w-full">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--admin-text-subtle)]" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索模型名称或上游 ID..."
              className="h-8 pl-8 text-[12.5px]"
            />
          </div>
          <div className="inline-flex items-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] p-0.5">
            {(
              [
                { value: "all", label: `全部 (${models.length})` },
                { value: "image", label: `生图 (${models.length - videoCount})` },
                { value: "video", label: `视频 (${videoCount})` },
              ] as const
            ).map((pill) => (
              <button
                key={pill.value}
                type="button"
                onClick={() => setKindFilter(pill.value)}
                className={cn(
                  "h-6 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors",
                  kindFilter === pill.value
                    ? "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
                    : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void loadModels()}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {/* Full-Width Hairline Models Table */}
      <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <table className="admin-table">
          <thead>
            <tr>
              <th>展示名称</th>
              <th>上游模型 ID</th>
              <th>能力标签</th>
              <th>阶梯积分单价</th>
              <th>排序权重</th>
              <th>启用状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-[var(--admin-text-muted)]">
                  <LoaderCircle className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            ) : filteredModels.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-[var(--admin-text-muted)]">
                  暂无匹配模型，点击右上角「+ 新增模型」通过右侧抽屉配置
                </td>
              </tr>
            ) : (
              filteredModels.map((model) => {
                const video = isVideoOnlyModel(model);
                return (
                  <tr key={model.id}>
                    <td className="font-medium text-[var(--admin-text)]">
                      {model.display_name || model.upstream_model}
                    </td>
                    <td>
                      <div className="inline-flex items-center gap-1 font-mono text-[12px] text-[var(--admin-text-muted)]">
                        <span>{model.upstream_model}</span>
                        <CopyButton value={model.upstream_model} label="复制上游模型 ID" />
                      </div>
                    </td>
                    <td>
                      {video ? (
                        <AdminStatusBadge tone="info">视频生成</AdminStatusBadge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(model.capabilities || []).map((cap) => (
                            <AdminStatusBadge key={cap} tone="neutral">
                              {CAPABILITY_SHORT_LABELS[cap] || cap}
                            </AdminStatusBadge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{renderTierPricing(model)}</td>
                    <td className="font-mono text-[12px] tabular-nums text-[var(--admin-text-muted)]">
                      {model.sort}
                    </td>
                    <td>
                      <Switch
                        checked={model.enabled}
                        disabled={togglingId === model.id}
                        onCheckedChange={(checked) => void handleToggleModel(model, checked)}
                        aria-label={`切换模型 ${model.display_name || model.upstream_model}`}
                      />
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => openEditDrawer(model)}
                        >
                          <Pencil className="size-3" />
                          编辑
                        </Button>
                        <Button
                          type="button"
                          variant="destructive-outline"
                          size="xs"
                          onClick={() => setDeletingModel(model)}
                        >
                          <Trash2 className="size-3" />
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 460px Right Slide Drawer for Model Form (NO centered modal!) */}
      <AdminSlideDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editingModel ? `编辑模型 · ${editingModel.display_name || editingModel.upstream_model}` : "新增渠道模型"}
        description={`${channel.name} · 配置上游模型映射与 1K / 2K / 4K 阶梯积分单价`}
        widthClassName="w-[min(460px,100vw)]"
      >
        <ImageChannelModelForm
          model={editingModel}
          saving={saving}
          suggestions={suggestions}
          existingUpstreamModels={models
            .filter((item) => item.id !== editingModel?.id)
            .map((item) => item.upstream_model)}
          initialUpstreamModel={initialUpstreamModel}
          onCancel={() => setDrawerOpen(false)}
          onSave={handleSaveModel}
        />
      </AdminSlideDrawer>

      <ConfirmDialog
        open={Boolean(deletingModel)}
        title="确认移除该渠道模型？"
        description={
          deletingModel
            ? `移除「${deletingModel.display_name || deletingModel.upstream_model}」后，前台创作台将不再展示该模型选项。`
            : ""
        }
        confirmLabel="确认移除"
        destructive
        pending={deleting}
        onClose={() => setDeletingModel(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AdminPageFrame>
  );
}
