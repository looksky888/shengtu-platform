"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Network, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  createImageChannel,
  deleteImageChannel,
  fetchImageChannels,
  updateImageChannel,
  type ImageChannel,
  type ImageChannelInput,
} from "@/lib/image-channel-api";
import { resetPublicModelChannelCache } from "@/lib/use-public-model-channel";

import { ImageChannelDialog } from "./image-channel-dialog";
import { ImageChannelModelsDialog } from "./image-channel-models-dialog";
import { ImageChannelRow } from "./image-channel-row";
import { SettingsCard, SettingsEmptyState } from "./settings-ui";

export function ImageProviderCard() {
  const [channels, setChannels] = useState<ImageChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [modelsDialogOpen, setModelsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ImageChannel | null>(null);
  const [modelsChannel, setModelsChannel] = useState<ImageChannel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<ImageChannel | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchImageChannels();
      setChannels(response.channels || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载生图渠道失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (input: ImageChannelInput) => {
    setSaving(true);
    try {
      if (editingChannel) await updateImageChannel(editingChannel.id, input);
      else await createImageChannel(input);
      toast.success(editingChannel ? "渠道已更新" : "渠道已添加");
      resetPublicModelChannelCache();
      setChannelDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存渠道失败");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!deletingChannel) return;
    setDeleting(true);
    try {
      await deleteImageChannel(deletingChannel.id);
      toast.success("渠道已删除");
      setDeletingChannel(null);
      resetPublicModelChannelCache();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除渠道失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SettingsCard
        icon={Network}
        title="生图渠道"
        tone="blue"
        className="md:col-span-2"
        meta={<span className="rounded-full bg-surface-muted px-3 py-1 text-xs text-muted-foreground">{channels.filter((item) => item.enabled).length} / {channels.length} 运行中</span>}
        action={
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="刷新渠道" disabled={loading} onClick={() => void load()}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</Button>
            <Button type="button" variant="brand" onClick={() => { setEditingChannel(null); setChannelDialogOpen(true); }}><Plus className="size-4" />新增渠道</Button>
          </div>
        }
      >
        {loading && channels.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
        ) : channels.length === 0 ? (
          <SettingsEmptyState icon={Network} title="尚未配置生图渠道" description="新增中转站后即可在图片创作台按渠道选择模型。" />
        ) : (
          <div className="grid gap-3">
            {channels.map((channel) => (
              <ImageChannelRow
                key={channel.id}
                channel={channel}
                onEdit={() => { setEditingChannel(channel); setChannelDialogOpen(true); }}
                onModels={() => { setModelsChannel(channel); setModelsDialogOpen(true); }}
                onDelete={() => setDeletingChannel(channel)}
              />
            ))}
          </div>
        )}
      </SettingsCard>

      <ImageChannelDialog channel={editingChannel} open={channelDialogOpen} saving={saving} onOpenChange={setChannelDialogOpen} onSave={save} />
      <ImageChannelModelsDialog channel={modelsChannel} open={modelsDialogOpen} onOpenChange={setModelsDialogOpen} onChanged={load} />
      <ConfirmDialog
        open={Boolean(deletingChannel)}
        title="确认删除生图渠道？"
        description={deletingChannel ? `将永久删除渠道“${deletingChannel.name}”及其绑定的全部模型配置。` : ""}
        confirmLabel="确认删除"
        destructive
        pending={deleting}
        onClose={() => setDeletingChannel(null)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}
