"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Film } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import type {
  ImageCapability,
  ImageChannelModel,
  ImageChannelModelInput,
} from "@/lib/image-channel-api";
import { isVideoChannelModelId } from "@/lib/model-catalog-normalizers";
import { cn } from "@/lib/utils";

import { toImageChannelModelInput } from "./image-channel-model-utils";
import {
  SettingsNotice,
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
  { value: "gif", label: "GIF" },
];

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 1 || num > 1000000) return null;
  return num;
}

function parseSortInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < -100000 || num > 100000) return null;
  return num;
}

function PillMultiSelect<T extends string>({
  label,
  hint,
  options,
  selected,
  minSelected = 1,
  minWarning,
  onChange,
  className,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: T[];
  minSelected?: number;
  minWarning: string;
  onChange: (values: T[]) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
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
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/[0.07] text-primary ring-1 ring-primary/20"
                  : "border-border/80 bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
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
  formId,
  model,
  saving,
  enabled,
  onEnabledChange,
  onVideoKindChange,
  suggestions,
  existingUpstreamModels = [],
  initialUpstreamModel,
  onSave,
}: {
  formId?: string;
  model: ImageChannelModel | null;
  saving: boolean;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  onVideoKindChange?: (isVideo: boolean) => void;
  suggestions: string[];
  existingUpstreamModels?: string[];
  initialUpstreamModel?: string;
  onCancel?: () => void;
  onSave: (input: ImageChannelModelInput) => Promise<void>;
}) {
  const [input, setInput] = useState<ImageChannelModelInput>(() =>
    toImageChannelModelInput(model, {
      upstream_model: model?.upstream_model || initialUpstreamModel || "",
    }),
  );
  const [costDraft, setCostDraft] = useState<string>(() =>
    String(model?.credit_cost ?? 1),
  );
  const [sortDraft, setSortDraft] = useState<string>(() =>
    String(model?.sort ?? 0),
  );
  const [tierDrafts, setTierDrafts] = useState<Record<string, string>>(() => {
    const base = toImageChannelModelInput(model);
    const map: Record<string, string> = {};
    for (const res of base.resolutions || []) {
      map[res] = String(base.credit_costs?.[res] ?? base.credit_cost ?? 1);
    }
    return map;
  });

  useEffect(() => {
    const next = toImageChannelModelInput(model, {
      upstream_model: model?.upstream_model || initialUpstreamModel || "",
    });
    setInput(next);
    setCostDraft(String(next.credit_cost ?? 1));
    setSortDraft(String(next.sort ?? 0));
    const nextTiers: Record<string, string> = {};
    for (const res of next.resolutions || []) {
      nextTiers[res] = String(
        next.credit_costs?.[res] ?? next.credit_cost ?? 1,
      );
    }
    setTierDrafts(nextTiers);
    onEnabledChange?.(next.enabled);
  }, [initialUpstreamModel, model, onEnabledChange]);

  const effectiveEnabled = enabled ?? input.enabled;

  const isVideoModel =
    isVideoChannelModelId(input.upstream_model) &&
    input.capabilities.length === 0;

  useEffect(() => {
    onVideoKindChange?.(isVideoModel);
  }, [isVideoModel, onVideoKindChange]);

  const existingSet = useMemo(
    () =>
      new Set(
        existingUpstreamModels
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    [existingUpstreamModels],
  );

  const set = <K extends keyof ImageChannelModelInput>(
    key: K,
    value: ImageChannelModelInput[K],
  ) => setInput((current) => ({ ...current, [key]: value }));

  const applySuggestion = (candidate: string) => {
    const trimmed = candidate.trim();
    const isVideoCandidate = isVideoChannelModelId(trimmed);
    const nextResolutions = isVideoCandidate
      ? []
      : (input.resolutions || []).length > 0
        ? input.resolutions || []
        : ["1k"];
    setInput((current) => ({
      ...current,
      upstream_model: trimmed,
      capabilities: isVideoCandidate
        ? []
        : current.capabilities.length > 0
          ? current.capabilities
          : ["generate", "edit"],
      resolutions: nextResolutions,
      formats: isVideoCandidate
        ? []
        : (current.formats || []).length > 0
          ? current.formats
          : ["png"],
    }));
    if (!isVideoCandidate) {
      setTierDrafts((prev) => {
        const next = { ...prev };
        for (const res of nextResolutions) {
          if (next[res] === undefined) {
            next[res] = costDraft || String(input.credit_cost || 1);
          }
        }
        return next;
      });
    }
  };

  const costError =
    !isVideoModel && parsePositiveInt(costDraft) === null
      ? "基础单张计费必须为不小于 1 的整数"
      : undefined;
  const sortError =
    parseSortInt(sortDraft) === null ? "请输入整数权重" : undefined;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;

    if (!input.upstream_model.trim()) {
      toast.error("请填写上游模型 ID");
      return;
    }
    if (
      input.capabilities.length === 0 &&
      !isVideoChannelModelId(input.upstream_model)
    ) {
      toast.error("请至少保留 1 项支持能力");
      return;
    }

    const parsedSort = parseSortInt(sortDraft);
    if (parsedSort === null) {
      toast.error("列表排序权重必须为整数");
      return;
    }

    let parsedBaseCost = input.credit_cost || 1;
    const normalizedTierCosts: Record<string, number> = {
      ...(input.credit_costs || {}),
    };

    if (!isVideoModel) {
      const validCost = parsePositiveInt(costDraft);
      if (validCost === null) {
        toast.error("基础单张计费必须为不小于 1 的整数");
        return;
      }
      parsedBaseCost = validCost;

      for (const res of input.resolutions || []) {
        const rawTier = tierDrafts[res] ?? String(parsedBaseCost);
        const validTier = parsePositiveInt(rawTier);
        if (validTier === null) {
          toast.error(`${res.toUpperCase()} 规格单价必须为不小于 1 的整数`);
          return;
        }
        normalizedTierCosts[res] = validTier;
      }
    }

    void onSave({
      ...input,
      enabled: effectiveEnabled,
      upstream_model: input.upstream_model.trim(),
      display_name: input.display_name.trim(),
      credit_cost: parsedBaseCost,
      credit_costs: normalizedTierCosts,
      sort: parsedSort,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {!model && suggestions.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border/80 bg-surface-subtle/50 p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>点击候选标签即可快速填入上游模型 ID：</span>
            <span className="tabular-nums">共 {suggestions.length} 个候选</span>
          </div>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {suggestions.map((suggestion) => {
              const mounted = existingSet.has(suggestion.trim().toLowerCase());
              const selected = input.upstream_model.trim() === suggestion.trim();
              return (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => applySuggestion(suggestion)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 font-mono text-xs transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/[0.07] text-primary ring-1 ring-primary/20"
                      : mounted
                        ? "border-border/70 bg-surface-muted/70 text-muted-foreground hover:border-border-strong hover:text-foreground"
                        : "border-border/80 bg-surface text-foreground hover:border-border-strong hover:bg-surface-hover",
                  )}
                >
                  <span>{suggestion}</span>
                  {mounted ? (
                    <span className="rounded bg-black/8 px-1 py-0.2 font-sans text-[10px] dark:bg-white/12">
                      已挂载
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isVideoModel ? (
        <SettingsNotice className="flex items-start gap-2.5 py-2.5">
          <Film className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <strong className="font-semibold text-foreground">
              视频生成模型兼容条目：
            </strong>
            该条目用于管理视频模型（
            <code className="font-mono">{input.upstream_model}</code>
            ）的显示名称、排序与启停状态，不会混入图片创作台模型列表；视频按秒积分单价统一在「本地号池路由与积分计费
            · Grok 视频每秒计费」中配置。
          </div>
        </SettingsNotice>
      ) : null}

      <div className="space-y-4 rounded-xl border border-border/75 bg-surface p-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
              value={costDraft}
              error={costError}
              onChange={setCostDraft}
              onBlur={() => {
                const parsed = parsePositiveInt(costDraft);
                if (parsed !== null) {
                  setCostDraft(String(parsed));
                  set("credit_cost", parsed);
                } else if (!costDraft.trim()) {
                  const fallback = Math.max(1, input.credit_cost || 1);
                  setCostDraft(String(fallback));
                }
              }}
            />
          ) : null}

          <SettingsUnitInput
            id="channel-model-sort"
            label="列表排序权重"
            unit="权重"
            value={sortDraft}
            error={sortError}
            onChange={setSortDraft}
            onBlur={() => {
              const parsed = parseSortInt(sortDraft);
              if (parsed !== null) {
                setSortDraft(String(parsed));
                set("sort", parsed);
              } else if (!sortDraft.trim()) {
                setSortDraft(String(input.sort ?? 0));
              }
            }}
          />
        </div>

        {!isVideoModel && (input.resolutions || []).length > 0 ? (
          <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-3.5 sm:grid-cols-3">
            {(input.resolutions || []).map((resolution) => {
              const rawVal =
                tierDrafts[resolution] ??
                String(
                  input.credit_costs?.[resolution] ?? input.credit_cost ?? 1,
                );
              const tierErr =
                parsePositiveInt(rawVal) === null ? "需为 ≥ 1 整数" : undefined;
              return (
                <SettingsUnitInput
                  key={resolution}
                  id={`channel-model-cost-${resolution}`}
                  label={`${resolution.toUpperCase()} 规格单价`}
                  unit="积分/张"
                  min={1}
                  max={1000000}
                  value={rawVal}
                  error={tierErr}
                  onChange={(value) =>
                    setTierDrafts((prev) => ({ ...prev, [resolution]: value }))
                  }
                  onBlur={() => {
                    const parsed = parsePositiveInt(rawVal);
                    if (parsed !== null) {
                      setTierDrafts((prev) => ({
                        ...prev,
                        [resolution]: String(parsed),
                      }));
                      set("credit_costs", {
                        ...(input.credit_costs || {}),
                        [resolution]: parsed,
                      });
                    } else if (!rawVal.trim()) {
                      const fallback = Math.max(
                        1,
                        input.credit_costs?.[resolution] ??
                          input.credit_cost ??
                          1,
                      );
                      setTierDrafts((prev) => ({
                        ...prev,
                        [resolution]: String(fallback),
                      }));
                    }
                  }}
                />
              );
            })}
          </div>
        ) : null}

        {!isVideoModel ? (
          <div className="grid grid-cols-1 gap-3.5 border-t border-border/60 pt-3.5 sm:grid-cols-2">
            <PillMultiSelect
              label="支持创作能力"
              hint={
                isVideoChannelModelId(input.upstream_model)
                  ? "可全部取消切换为纯视频条目"
                  : "至少保留 1 项"
              }
              options={CAPABILITY_OPTIONS}
              selected={input.capabilities}
              minSelected={isVideoChannelModelId(input.upstream_model) ? 0 : 1}
              minWarning="图片模型至少需要保留 1 项创作能力"
              onChange={(values) => set("capabilities", values)}
              className="sm:col-span-2"
            />
            <PillMultiSelect
              label="可选输出分辨率"
              options={RESOLUTION_OPTIONS}
              selected={input.resolutions || []}
              minSelected={1}
              minWarning="请至少保留 1 档可选分辨率"
              onChange={(values) => {
                set("resolutions", values);
                setTierDrafts((prev) => {
                  const next = { ...prev };
                  for (const res of values) {
                    if (next[res] === undefined) {
                      next[res] = String(
                        input.credit_costs?.[res] ?? input.credit_cost ?? 1,
                      );
                    }
                  }
                  return next;
                });
              }}
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
      </div>
    </form>
  );
}
