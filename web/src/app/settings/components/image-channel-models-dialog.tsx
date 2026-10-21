import { useCallback, useEffect, useState } from "react";
import { Boxes, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

import { ImageChannelModelForm } from "./image-channel-model-form";
import { SettingsEmptyState } from "./settings-ui";

function modelPrice(model: ImageChannelModel) {
  const tiers = Object.entries(model.credit_costs || {});
  if (!tiers.length) return `${model.credit_cost} 积分`;
  return tiers.map(([resolution, cost]) => `${resolution.toUpperCase()} ${cost}`).join(" · ");
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
  const [editing, setEditing] = useState<ImageChannelModel | null | undefined>();
  const [deletingModel, setDeletingModel] = useState<ImageChannelModel | null>(null);
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
      toast.error(error instanceof Error ? error.message : "加载渠道模型失败");
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
      if (editing) await updateImageChannelModel(channel.id, editing.id, input);
      else await createImageChannelModel(channel.id, input);
      toast.success(editing ? "模型已更新" : "模型已添加");
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
      toast.success(`已获取 ${response.models?.length || 0} 个上游模型，请选择后保存`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取上游模型失败");
    } finally {
      setDiscovering(false);
    }
  };

  const confirmRemove = async () => {
    if (!channel || !deletingModel) return;
    setDeleting(true);
    try {
      await deleteImageChannelModel(channel.id, deletingModel.id);
      toast.success("模型已删除");
      setDeletingModel(null);
      resetPublicModelChannelCache();
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除模型失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[min(96vw,1040px)] overflow-y-auto">
        <DialogHeader className="pr-10">
          <DialogTitle>{channel?.name || "渠道"} · 模型管理</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button type="button" variant="brand" onClick={() => { setSuggestionForForm(""); setEditing(null); }}><Plus className="size-4" />新增模型</Button>
            {channel?.type === "openai_compatible" ? (
              <Button type="button" variant="outline" loading={discovering} disabled={discovering} onClick={() => void discover()}>
                <RefreshCw className="size-4" />拉取模型
              </Button>
            ) : null}
          </div>
          <Badge variant={channel?.enabled ? "success" : "secondary"}>{models.filter((item) => item.enabled).length} / {models.length} 已启用</Badge>
        </div>

        {suggestions.length > 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">已发现的上游模型（点击后填入表单，保存后才会出现在创作台）</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  size="sm"
                  variant={suggestionForForm === suggestion ? "default" : "outline"}
                  onClick={() => { setSuggestionForForm(suggestion); setEditing(null); }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {editing !== undefined ? (
          <ImageChannelModelForm model={editing} saving={saving} suggestions={suggestions} initialUpstreamModel={suggestionForForm} onCancel={() => { setSuggestionForForm(""); setEditing(undefined); }} onSave={save} />
        ) : null}

        {loading ? (
          <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
        ) : models.length === 0 ? (
          <SettingsEmptyState icon={Boxes} title="尚未配置模型" description="添加模型后，它会出现在图片创作台的对应渠道中。" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <Table>
              <TableHeader><TableRow><TableHead>模型</TableHead><TableHead>能力</TableHead><TableHead>规格价格</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>{models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell><div className="font-medium">{model.display_name}</div><code className="text-xs text-muted-foreground">{model.upstream_model}</code></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{model.capabilities.map((item) => item === "edit" ? "编辑" : "生成").join(" · ")}</TableCell>
                  <TableCell className="text-xs">{modelPrice(model)}</TableCell>
                  <TableCell><Badge variant={model.enabled ? "success" : "secondary"}>{model.enabled ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell><div className="flex justify-end gap-1"><Button type="button" size="icon-sm" variant="ghost" aria-label="编辑模型" onClick={() => setEditing(model)}><Pencil className="size-4" /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label="删除模型" className="text-destructive" onClick={() => setDeletingModel(model)}><Trash2 className="size-4" /></Button></div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}

        <ConfirmDialog
          open={Boolean(deletingModel)}
          title="确认删除模型？"
          description={deletingModel ? `将从渠道“${channel?.name ?? ""}”中移除模型“${deletingModel.display_name}”。` : ""}
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
