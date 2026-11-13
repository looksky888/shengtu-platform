"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ImageAccountPoolRoutingCard } from "@/app/settings/components/image-account-pool-routing-card";
import { ImageChannelDialog } from "@/app/settings/components/image-channel-dialog";
import { CHANNEL_TYPE_LABELS } from "@/app/settings/components/image-channel-model-labels";
import { useSettingsStore } from "@/app/settings/store";
import {
  AdminPageFrame,
  AdminStatTile,
  AdminStatusBadge,
} from "@/components/admin";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  createImageChannel,
  deleteImageChannel,
  fetchImageChannels,
  updateImageChannel,
  type ImageChannel,
  type ImageChannelInput,
} from "@/lib/image-channel-api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { resetPublicModelChannelCache } from "@/lib/use-public-model-channel";
import { cn } from "@/lib/utils";

import { ChannelModelsView } from "./channel-models-view";

export default function AdminChannelsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/channels");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeChannelId = searchParams.get("channel") || "";

  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const configLoaded = useSettingsStore((state) => Boolean(state.loadedAt.config));

  const [channels, setChannels] = useState<ImageChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ImageChannel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<ImageChannel | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadChannels = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetchImageChannels();
      setChannels(response.channels || []);
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "加载系统渠道失败");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadChannels();
    if (!configLoaded) {
      void loadConfig();
    }
  }, [configLoaded, loadChannels, loadConfig, session]);

  const activeChannel = useMemo(
    () => channels.find((item) => item.id === activeChannelId) ?? null,
    [activeChannelId, channels],
  );

  const openChannelModels = (channelId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("channel", channelId);
    setSearchParams(next);
  };

  const closeChannelModels = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("channel");
    setSearchParams(next);
  };

  const handleSaveChannel = async (input: ImageChannelInput) => {
    setSaving(true);
    try {
      if (editingChannel) {
        await updateImageChannel(editingChannel.id, input);
        toast.success("生图渠道已更新");
      } else {
        await createImageChannel(input);
        toast.success("生图渠道已创建");
      }
      resetPublicModelChannelCache();
      setChannelDialogOpen(false);
      await loadChannels(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存渠道失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (channel: ImageChannel, nextEnabled: boolean) => {
    setTogglingId(channel.id);
    try {
      await updateImageChannel(channel.id, {
        name: channel.name,
        alias: channel.alias || "",
        type: channel.type,
        base_url: channel.base_url || "",
        api_key: "",
        enabled: nextEnabled,
        sort: channel.sort,
        max_concurrency: channel.max_concurrency,
        timeout_seconds: channel.timeout_seconds,
        max_retries: channel.max_retries,
        download_urls: channel.download_urls,
      });
      setChannels((prev) =>
        prev.map((item) =>
          item.id === channel.id ? { ...item, enabled: nextEnabled } : item,
        ),
      );
      resetPublicModelChannelCache();
      toast.success(nextEnabled ? `已启用渠道「${channel.name}」` : `已停用渠道「${channel.name}」`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换渠道状态失败");
    } finally {
      setTogglingId("");
    }
  };

  const handleDeleteChannel = async () => {
    if (!deletingChannel) return;
    setDeleting(true);
    try {
      await deleteImageChannel(deletingChannel.id);
      toast.success(`渠道「${deletingChannel.name}」已删除`);
      setDeletingChannel(null);
      resetPublicModelChannelCache();
      await loadChannels(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除渠道失败");
    } finally {
      setDeleting(false);
    }
  };

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  // Drill-down Full-Width Model Manager when ?channel=<id> matches
  if (activeChannel) {
    return (
      <ChannelModelsView
        channel={activeChannel}
        onBack={closeChannelModels}
        onChanged={() => loadChannels(true)}
      />
    );
  }

  const enabledChannels = channels.filter((c) => c.enabled).length;
  const totalModels = channels.reduce((acc, c) => acc + (c.model_count || 0), 0);
  const enabledModels = channels.reduce((acc, c) => acc + (c.enabled_models || 0), 0);
  const totalConcurrency = channels
    .filter((c) => c.enabled)
    .reduce((acc, c) => acc + (c.max_concurrency || 0), 0);

  return (
    <AdminPageFrame
      groupLabel="算力与号池"
      title="系统渠道"
      description="统一编排内置 ChatGPT / Grok 本地号池与第三方 OpenAI 兼容中转渠道；点击「模型管理」进入全宽阶梯单价工作台。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadChannels()}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingChannel(null);
              setChannelDialogOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            新增中转渠道
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="运行中渠道"
          value={`${enabledChannels} / ${channels.length}`}
          tone={enabledChannels > 0 ? "success" : "warning"}
          hint="内置本地号池 + OpenAI 兼容中转"
        />
        <AdminStatTile
          label="已启用模型 / 总挂载模型"
          value={`${enabledModels} / ${totalModels}`}
          hint="点击任意渠道「模型管理」配置阶梯积分"
        />
        <AdminStatTile
          label="聚合最大并发度"
          value={`${totalConcurrency} 路`}
          hint="按启用渠道最大并发配额汇总"
        />
      </div>

      {/* Hairline Channels Table */}
      <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <table className="admin-table">
          <thead>
            <tr>
              <th>渠道名称</th>
              <th>渠道类型</th>
              <th>上游网关 / 密钥</th>
              <th>已启用模型</th>
              <th>并发 / 超时</th>
              <th>排序</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-[var(--admin-text-muted)]">
                  <LoaderCircle className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            ) : channels.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-[var(--admin-text-muted)]">
                  暂无供给渠道配置
                </td>
              </tr>
            ) : (
              channels.map((channel) => (
                <tr key={channel.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--admin-text)]">
                        {channel.name}
                      </span>
                      {channel.system ? (
                        <AdminStatusBadge tone="info">系统内置</AdminStatusBadge>
                      ) : null}
                    </div>
                    {channel.alias ? (
                      <div className="font-mono text-[11px] text-[var(--admin-text-subtle)]">
                        {channel.alias}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <AdminStatusBadge tone="neutral">
                      {CHANNEL_TYPE_LABELS[channel.type] || channel.type}
                    </AdminStatusBadge>
                  </td>
                  <td className="max-w-[240px] truncate font-mono text-[12px] text-[var(--admin-text-muted)]">
                    {channel.type === "openai_compatible"
                      ? channel.base_url || "未配置地址"
                      : "本地号池直连调度"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openChannelModels(channel.id)}
                      className="inline-flex items-center gap-1.5 font-mono text-[12px] font-medium text-[var(--admin-text)] underline-offset-4 hover:underline"
                    >
                      <Boxes className="size-3.5 text-[var(--admin-text-muted)]" />
                      {channel.enabled_models} / {channel.model_count} 个模型
                    </button>
                  </td>
                  <td className="font-mono text-[12px] tabular-nums text-[var(--admin-text-muted)]">
                    {channel.max_concurrency} 路 · {channel.timeout_seconds}s
                  </td>
                  <td className="font-mono text-[12px] tabular-nums text-[var(--admin-text-muted)]">
                    {channel.sort}
                  </td>
                  <td>
                    <Switch
                      checked={channel.enabled}
                      disabled={togglingId === channel.id}
                      onCheckedChange={(checked) => void handleToggleEnabled(channel, checked)}
                      aria-label={`切换渠道 ${channel.name}`}
                    />
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => openChannelModels(channel.id)}
                      >
                        <Boxes className="size-3" />
                        模型管理
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setEditingChannel(channel);
                          setChannelDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3" />
                        编辑
                      </Button>
                      {!channel.system ? (
                        <Button
                          type="button"
                          variant="destructive-outline"
                          size="xs"
                          onClick={() => setDeletingChannel(channel)}
                        >
                          <Trash2 className="size-3" />
                          删除
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Built-in Local Account Pool Routing & Fallback Card */}
      <ImageAccountPoolRoutingCard />

      <ImageChannelDialog
        channel={editingChannel}
        open={channelDialogOpen}
        saving={saving}
        onOpenChange={setChannelDialogOpen}
        onSave={handleSaveChannel}
      />

      <ConfirmDialog
        open={Boolean(deletingChannel)}
        title="确认删除该中转渠道？"
        description={
          deletingChannel
            ? `删除渠道「${deletingChannel.name}」将同时移除其下挂载的 ${deletingChannel.model_count} 个模型配置。`
            : ""
        }
        confirmLabel="确认删除"
        destructive
        pending={deleting}
        onClose={() => setDeletingChannel(null)}
        onConfirm={() => void handleDeleteChannel()}
      />
    </AdminPageFrame>
  );
}
