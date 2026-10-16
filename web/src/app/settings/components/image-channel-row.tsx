import { Boxes, Coins, Gauge, Pencil, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ImageChannel } from "@/lib/image-channel-api";
import { useSettingsStore } from "../store";
import { settingsInputClassName } from "./settings-ui";

const typeLabels: Record<ImageChannel["type"], string> = {
  account_pool: "本地 GPT 号池",
  grok_runtime: "本地 Grok 号池",
  openai_compatible: "OpenAI 兼容",
};

export function ImageChannelRow({ channel, onEdit, onModels, onDelete }: {
  channel: ImageChannel;
  onEdit: () => void;
  onModels: () => void;
  onDelete: () => void;
}) {
  const config = useSettingsStore((state) => state.config);
  const loadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const savingConfig = useSettingsStore((state) => state.isSavingConfig);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);
  const setVideoCreditCostPerSecond = useSettingsStore((state) => state.setVideoCreditCostPerSecond);

  return (
    <div className="grid gap-4 rounded-[18px] border border-border/70 bg-background px-4 py-4 transition-colors hover:border-border md:grid-cols-[minmax(0,1.35fr)_minmax(250px,.9fr)_220px] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{channel.name}</span>
          {channel.alias ? <Badge variant="outline">{channel.alias}</Badge> : null}
          <Badge variant={channel.enabled ? "success" : "secondary"}>{channel.enabled ? "已启用" : "已停用"}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {typeLabels[channel.type]}{channel.base_url ? ` · ${channel.base_url}` : ""}
        </div>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Boxes className="size-3.5 shrink-0" />{channel.enabled_models} / {channel.model_count} 模型</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Gauge className="size-3.5 shrink-0" />并发 {channel.max_concurrency} · {channel.timeout_seconds}s</span>
      </div>
      <div className="flex min-w-0 justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onModels}><Boxes className="size-4" />模型管理</Button>
        <Button type="button" variant="ghost" size="icon" aria-label="编辑渠道" onClick={onEdit}><Pencil className="size-4" /></Button>
        {!channel.system ? <Button type="button" variant="ghost" size="icon" aria-label="删除渠道" className="text-destructive" onClick={onDelete}><Trash2 className="size-4" /></Button> : null}
      </div>
      {channel.type === "grok_runtime" ? (
        <div className="grid gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3 md:col-span-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] md:items-end dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Coins className="size-4 text-amber-600" />Grok 本地号池 · 视频模型</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">grok-imagine-video · 视频生成随本渠道启停，按生成时长扣除积分。</div>
          </div>
          <Field>
            <FieldLabel htmlFor={`grok-video-credit-${channel.id}`}>每秒积分</FieldLabel>
            <Input id={`grok-video-credit-${channel.id}`} type="number" min={1} step={1} value={String(config?.video_credit_cost_per_second ?? 1)} onChange={(event) => setVideoCreditCostPerSecond(event.target.value)} className={settingsInputClassName} disabled={loadingConfig || !config} />
          </Field>
          <Button type="button" variant="outline" disabled={loadingConfig || savingConfig || !config} onClick={() => void saveConfigSection(["video_credit_cost_per_second"])}><Save className="size-4" />{savingConfig ? "保存中" : "保存视频计费"}</Button>
        </div>
      ) : null}
    </div>
  );
}
