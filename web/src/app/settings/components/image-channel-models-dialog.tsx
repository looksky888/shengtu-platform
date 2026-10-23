"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
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
import { resetPublicModelChannelCache } from "@/lib/use-public-model-channel";
import { cn } from "@/lib/utils";

import {
  CAPABILITY_LABELS,
  ImageChannelModelForm,
} from "./image-channel-model-form";
import { SettingsEmptyState } from "./settings-ui";

function modelPrice(model: ImageChannelModel) {
  const tiers = Object.entries(model.credit_costs || {});
  if (!tiers.length) return `${model.credit_cost} 积分/张`;
  return tiers
    .map(([resolution, cost]) => `${resolution.toUpperCase()} ${cost} 积分`)
    .join(" · ");
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionForForm, setSuggestionForForm] = useState("");
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
        error instanceof Error ? error.message : "加载渠道模型失败"
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
      void load();
    }
  }, [load, open]);

  const save = async (input: ImageChannelModelInput) => {
    if (!channel) return;
    setSaving(true);
    try {
      if (editing)
        await updateImageChannelModel(channel.id, editing.id, input);
      else await createImageChannelModel(channel.id, input);
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

  const discover = async () => {
    if (!channel) return;
    setDiscovering(true);
    try {
      const response = await discoverImageChannelModels(channel.id);
      setSuggestions(response.models || []);
      setEditing(null);
      setSuggestionForForm("");
      toast.success(
        `已拉取 ${response.models?.length || 0} 个上游候选模型，点击标签即可填入表单`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "拉取上游模型失败"
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

  const enabledModelsCount = models.filter((item) => item.enabled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[min(96vw,1000px)] overflow-y-auto rounded-2xl p-6">
        <DialogHeader className="gap-1 pr-10">
          <DialogTitle className="text-base font-semibold">
            {channel?.name || "渠道"} · 模型与单价管理
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            管理该渠道对外暴露的生图/修图模型、分辨率规格与单张积分价格
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <Badge
            variant="outline"
            className="h-5 gap-1.5 border-border/75 bg-surface-subtle px-2 text-[11px] tabular-nums text-muted-foreground"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                enabledModelsCount > 0
                  ? "bg-status-success"
                  : "bg-muted-foreground/55"
              )}
            />
            {enabledModelsCount} / {models.length} 个模型已启用
          </Badge>
        </div>

        {suggestions.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-border/80 bg-surface-subtle/45 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              已发现 {suggestions.length} 个上游模型（点击一键填入下方配置表单）：
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  size="sm"
                  variant={
                    suggestionForForm === suggestion ? "default" : "outline"
                  }
                  onClick={() => {
                    setSuggestionForForm(suggestion);
                    setEditing(null);
                  }}
                  className="h-7 px-2.5 font-mono text-xs"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {editing !== undefined ? (
          <ImageChannelModelForm
            model={editing}
            saving={saving}
            suggestions={suggestions}
            initialUpstreamModel={suggestionForForm}
            onCancel={() => {
              setSuggestionForForm("");
              setEditing(undefined);
            }}
            onSave={save}
          />
        ) : null}

        {loading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : models.length === 0 ? (
          <SettingsEmptyState
            icon={Boxes}
            title="当前渠道尚未挂载模型"
            description="点击上方「新增模型」或「从上游拉取模型」后，模型即可出现在图片创作台中。"
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/75 bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-subtle/55">
                  <TableHead>模型名称 / 上游 ID</TableHead>
                  <TableHead>支持能力</TableHead>
                  <TableHead>积分定价</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {model.display_name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {model.upstream_model}
                        </code>
                        <CopyButton
                          value={model.upstream_model}
                          title="复制上游模型 ID"
                          toastMessage="已复制模型 ID"
                          className="size-6 rounded text-muted-foreground hover:text-foreground"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {model.capabilities.map((cap) => (
                          <Badge
                            key={cap}
                            variant="secondary"
                            className="h-5 px-1.5 text-[11px] font-normal"
                          >
                            {CAPABILITY_LABELS[cap] || cap}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {modelPrice(model)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 gap-1.5 px-2 text-[11px]",
                          model.enabled
                            ? "border-status-success/25 bg-status-success-soft font-medium text-status-success"
                            : "border-border/75 bg-surface-subtle text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            model.enabled
                              ? "bg-status-success"
                              : "bg-muted-foreground/55"
                          )}
                        />
                        {model.enabled ? "已启用" : "已停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="编辑模型"
                          title="编辑模型"
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
                          title="删除模型"
                          onClick={() => setDeletingModel(model)}
                          className="size-7.5 text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <ConfirmDialog
          open={Boolean(deletingModel)}
          title="确认移除该渠道模型？"
          description={
            deletingModel
              ? `即将从渠道「${channel?.name ?? ""}」中移除模型「${deletingModel.display_name}」，创作台将不再展示该选项。`
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
