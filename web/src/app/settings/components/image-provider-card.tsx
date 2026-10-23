"use client";

import { useCallback, useEffect, useState } from "react";
import { Network, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createImageChannel,
  deleteImageChannel,
  fetchImageChannels,
  updateImageChannel,
  type ImageChannel,
  type ImageChannelInput,
} from "@/lib/image-channel-api";
import { resetPublicModelChannelCache } from "@/lib/use-public-model-channel";
import { cn } from "@/lib/utils";

import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";
import { ImageChannelDialog } from "./image-channel-dialog";
import { ImageChannelModelsDialog } from "./image-channel-models-dialog";
import { ImageChannelRow } from "./image-channel-row";
import { SettingsCard, SettingsEmptyState } from "./settings-ui";

export function ImageProviderCard() {
  const [channels, setChannels] = useState<ImageChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [modelsDialogOpen, setModelsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ImageChannel | null>(
    null
  );
  const [modelsChannel, setModelsChannel] = useState<ImageChannel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<ImageChannel | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetchImageChannels();
      setChannels(response.channels || []);
    } catch (error) {
      if (!silent) {
        toast.error(
          error instanceof Error ? error.message : "加载生图渠道失败"
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (!detail?.tab || detail.tab === "image") {
        void load(true);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
  }, [load]);

  const save = async (input: ImageChannelInput) => {
    setSaving(true);
    try {
      if (editingChannel) await updateImageChannel(editingChannel.id, input);
      else await createImageChannel(input);
      toast.success(editingChannel ? "生图渠道已更新" : "生图渠道已创建");
      resetPublicModelChannelCache();
      setChannelDialogOpen(false);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存渠道失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleChannelEnabled = async (
    channel: ImageChannel,
    nextEnabled: boolean
  ) => {
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
          item.id === channel.id ? { ...item, enabled: nextEnabled } : item
        )
      );
      resetPublicModelChannelCache();
      toast.success(
        nextEnabled
          ? `已启用渠道「${channel.name}」`
          : `已停用渠道「${channel.name}」`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换渠道状态失败");
    } finally {
      setTogglingId("");
    }
  };

  const confirmRemove = async () => {
    if (!deletingChannel) return;
    setDeleting(true);
    try {
      await deleteImageChannel(deletingChannel.id);
      toast.success(`渠道「${deletingChannel.name}」已删除`);
      setDeletingChannel(null);
      resetPublicModelChannelCache();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除渠道失败");
    } finally {
      setDeleting(false);
    }
  };

  const enabledCount = channels.filter((item) => item.enabled).length;

  return (
    <>
      <SettingsCard
        icon={Network}
        title="生图与视频供给渠道"
        description="统一管理内置 GPT / Grok 本地号池及任意 OpenAI 兼容第三方中转渠道"
        className="md:col-span-2"
        meta={
          <Badge
            variant="outline"
            className="h-5 gap-1.5 border-border/75 bg-surface-subtle px-2 text-[11px] tabular-nums text-muted-foreground"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                enabledCount > 0 ? "bg-status-success" : "bg-muted-foreground/60"
              )}
            />
            {enabledCount} / {channels.length} 运行中
          </Badge>
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="刷新渠道列表"
              disabled={loading}
              onClick={() => void load()}
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
              <span>刷新</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingChannel(null);
                setChannelDialogOpen(true);
              }}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              <Plus className="size-3.5" />
              <span>新增中转渠道</span>
            </Button>
          </div>
        }
      >
        {loading && channels.length === 0 ? (
          <div className="space-y-2.5 py-1">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : channels.length === 0 ? (
          <SettingsEmptyState
            icon={Network}
            title="尚未配置生图供给渠道"
            description="新增 OpenAI 兼容中转站后，即可在图片创作台按渠道自由选择上游模型。"
          />
        ) : (
          <div className="grid gap-2.5">
            {channels.map((channel) => (
              <ImageChannelRow
                key={channel.id}
                channel={channel}
                toggling={togglingId === channel.id}
                onToggleEnabled={(nextEnabled) =>
                  void toggleChannelEnabled(channel, nextEnabled)
                }
                onEdit={() => {
                  setEditingChannel(channel);
                  setChannelDialogOpen(true);
                }}
                onModels={() => {
                  setModelsChannel(channel);
                  setModelsDialogOpen(true);
                }}
                onDelete={() => setDeletingChannel(channel)}
              />
            ))}
          </div>
        )}
      </SettingsCard>

      <ImageChannelDialog
        channel={editingChannel}
        open={channelDialogOpen}
        saving={saving}
        onOpenChange={setChannelDialogOpen}
        onSave={save}
      />
      <ImageChannelModelsDialog
        channel={modelsChannel}
        open={modelsDialogOpen}
        onOpenChange={setModelsDialogOpen}
        onChanged={() => load(true)}
      />
      <ConfirmDialog
        open={Boolean(deletingChannel)}
        title="确认删除生图渠道？"
        description={
          deletingChannel
            ? `将永久删除渠道「${deletingChannel.name}」及其名下绑定的全部模型路由配置，此操作不可撤销。`
            : ""
        }
        confirmLabel="确认删除渠道"
        destructive
        pending={deleting}
        onClose={() => setDeletingChannel(null)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}
