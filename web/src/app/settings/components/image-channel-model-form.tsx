"use client";

import { useEffect, useState } from "react";
import { Check, Film } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ImageCapability,
  ImageChannelModel,
  ImageChannelModelInput,
} from "@/lib/image-channel-api";
import { isVideoChannelModelId } from "@/lib/model-catalog-normalizers";
import { cn } from "@/lib/utils";

import {
  SettingsNotice,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsDialogInputClassName,
} from "./settings-ui";

const CAPABILITY_OPTIONS: ReadonlyArray<{
  value: ImageCapability;
  label: string;
}> = [
  { value: "generate", label: "文生图 (Generate)" },
  { value: "edit", label: "图生图编辑 (Edit)" },
];

const RESOLUTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "1k", label: "1K 标准" },
  { value: "2k", label: "2K 高清" },
  { value: "4k", label: "4K 超清" },
];

const FORMAT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
];

const defaultModelInput: ImageChannelModelInput = {
  display_name: "",
  upstream_model: "",
  capabilities: ["generate", "edit"],
  resolutions: ["1k"],
  formats: ["png"],
  credit_cost: 1,
  credit_costs: { "1k": 1 },
  enabled: true,
  sort: 10,
};

function fromModel(model: ImageChannelModel | null): ImageChannelModelInput {
  if (!model) return defaultModelInput;
  const safeCapabilities = Array.isArray(model.capabilities)
    ? [...model.capabilities]
    : [];
  const safeResolutions = Array.isArray(model.resolutions)
    ? [...model.resolutions]
    : [];
  const safeFormats = Array.isArray(model.formats) ? [...model.formats] : [];
  const videoOnly =
    safeCapabilities.length === 0 && isVideoChannelModelId(model.upstream_model);

  return {
    display_name: model.display_name,
    upstream_model: model.upstream_model,
    capabilities: videoOnly
      ? []
      : safeCapabilities.length > 0
        ? safeCapabilities
        : ["generate"],
    resolutions: videoOnly
      ? safeResolutions
      : safeResolutions.length > 0
        ? safeResolutions
        : ["1k"],
    formats: videoOnly
      ? safeFormats
      : safeFormats.length > 0
        ? safeFormats
        : ["png"],
    credit_cost: Math.max(1, Number(model.credit_cost) || 1),
    credit_costs: { ...(model.credit_costs || {}) },
    enabled: model.enabled,
    sort: model.sort,
  };
}

function PillMultiSelect<T extends string>({
  label,
  hint,
  options,
  selected,
  minSelected = 1,
  minWarning,
  onChange,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: T[];
  minSelected?: number;
  minWarning: string;
  onChange: (values: T[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-xs font-medium text-foreground sm:text-[13px]">
          {label}
        </span>
        {hint ? (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (active) {
                  if (selected.length <= minSelected) {
                    toast.warning(minWarning);
                    return;
                  }
                  onChange(selected.filter((item) => item !== option.value));
                } else {
                  onChange([...selected, option.value]);
                }
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                active
                  ? "border-foreground/85 bg-primary text-primary-foreground shadow-2xs"
                  : "border-border/80 bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
              )}
            >
              {active ? <Check className="size-3 shrink-0" /> : null}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ImageChannelModelForm({
  model,
  saving,
  suggestions,
  initialUpstreamModel,
  onCancel,
  onSave,
}: {
  model: ImageChannelModel | null;
  saving: boolean;
  suggestions: string[];
  initialUpstreamModel?: string;
  onCancel: () => void;
  onSave: (input: ImageChannelModelInput) => Promise<void>;
}) {
  const [input, setInput] = useState<ImageChannelModelInput>(() => ({
    ...fromModel(model),
    upstream_model: model?.upstream_model || initialUpstreamModel || "",
  }));

  useEffect(() => {
    setInput({
      ...fromModel(model),
      upstream_model: model?.upstream_model || initialUpstreamModel || "",
    });
  }, [initialUpstreamModel, model]);

  const set = <K extends keyof ImageChannelModelInput>(
    key: K,
    value: ImageChannelModelInput[K]
  ) => setInput((current) => ({ ...current, [key]: value }));

  const isVideoModel =
    isVideoChannelModelId(input.upstream_model) &&
    input.capabilities.length === 0;

  const handleSubmit = () => {
    if (!input.upstream_model.trim()) {
      toast.error("请填写上游模型 ID");
      return;
    }
    if (input.capabilities.length === 0 && !isVideoChannelModelId(input.upstream_model)) {
      toast.error("请至少保留 1 项支持能力");
      return;
    }
    void onSave(input);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-surface-subtle/55 p-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <span className="text-sm font-semibold text-foreground">
          {model
            ? `编辑模型 · ${model.display_name || model.upstream_model}`
            : "配置新渠道模型"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {isVideoModel
            ? "视频模型在视频创作台按秒计费调度"
            : "保存后立即同步至图片创作台"}
        </span>
      </div>

      {isVideoModel ? (
        <SettingsNotice className="flex items-start gap-2.5 py-2.5">
          <Film className="mt-0.5 size-4 shrink-0 text-foreground" />
          <div>
            <strong className="font-semibold text-foreground">
              视频生成模型兼容条目：
            </strong>
            该条目用于管理视频模型（<code className="font-mono">{input.upstream_model}</code>
            ）的显示名称、排序与启停状态，不会混入图片创作台模型列表；视频按秒积分单价统一在下方「全局回退单价 · 视频每秒单价」中配置。
          </div>
        </SettingsNotice>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="channel-model-upstream"
            className="block text-xs font-medium text-foreground sm:text-[13px]"
          >
            上游模型 ID
          </label>
          <Input
            id="channel-model-upstream"
            list="channel-model-suggestions"
            value={input.upstream_model}
            onChange={(event) => set("upstream_model", event.target.value)}
            className={cn(settingsDialogInputClassName, "font-mono text-xs")}
            placeholder="例如：gpt-image-1 或 grok-imagine-image"
          />
          <datalist id="channel-model-suggestions">
            {suggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="channel-model-name"
            className="block text-xs font-medium text-foreground sm:text-[13px]"
          >
            前台显示名称
          </label>
          <Input
            id="channel-model-name"
            value={input.display_name}
            onChange={(event) => set("display_name", event.target.value)}
            className={settingsDialogInputClassName}
            placeholder="留空则默认展示上游模型 ID"
          />
        </div>

        {!isVideoModel ? (
          <SettingsUnitInput
            id="channel-model-cost"
            label="基础单张计费"
            unit="积分/张"
            min={1}
            max={1000000}
            rangeHint="≥ 1"
            value={input.credit_cost}
            onChange={(value) =>
              set("credit_cost", Math.max(1, Number(value) || 1))
            }
          />
        ) : null}

        <SettingsUnitInput
          id="channel-model-sort"
          label="列表排序权重"
          unit="权重"
          value={input.sort}
          onChange={(value) => set("sort", Number(value) || 0)}
        />
      </div>

      {!isVideoModel && (input.resolutions || []).length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {(input.resolutions || []).map((resolution) => (
            <SettingsUnitInput
              key={resolution}
              id={`channel-model-cost-${resolution}`}
              label={`${resolution.toUpperCase()} 规格单价`}
              unit="积分/张"
              min={1}
              max={1000000}
              value={input.credit_costs?.[resolution] ?? input.credit_cost}
              onChange={(value) =>
                set("credit_costs", {
                  ...(input.credit_costs || {}),
                  [resolution]: Math.max(1, Number(value) || 1),
                })
              }
            />
          ))}
        </div>
      ) : null}

      {!isVideoModel ? (
        <div className="grid gap-4 border-t border-border/60 pt-3.5 lg:grid-cols-3">
          <PillMultiSelect
            label="支持创作能力"
            hint={isVideoChannelModelId(input.upstream_model) ? "可全部取消切换为纯视频条目" : "至少保留 1 项"}
            options={CAPABILITY_OPTIONS}
            selected={input.capabilities}
            minSelected={isVideoChannelModelId(input.upstream_model) ? 0 : 1}
            minWarning="图片模型至少需要保留 1 项创作能力"
            onChange={(values) => set("capabilities", values)}
          />
          <PillMultiSelect
            label="可选输出分辨率"
            options={RESOLUTION_OPTIONS}
            selected={input.resolutions || []}
            minSelected={1}
            minWarning="请至少保留 1 档可选分辨率"
            onChange={(values) => set("resolutions", values)}
          />
          <PillMultiSelect
            label="可选图像格式"
            options={FORMAT_OPTIONS}
            selected={input.formats || []}
            minSelected={1}
            minWarning="请至少保留 1 种输出图像格式"
            onChange={(values) => set("formats", values)}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3.5">
        <SettingsSwitchRow
          size="sm"
          title="启用该模型"
          description="关闭后创作台暂停展示该模型"
          checked={input.enabled}
          onCheckedChange={(checked) => set("enabled", checked)}
          className="bg-surface"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            loading={saving}
            onClick={handleSubmit}
          >
            保存模型配置
          </Button>
        </div>
      </div>
    </div>
  );
}
