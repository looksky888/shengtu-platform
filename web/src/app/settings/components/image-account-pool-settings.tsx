"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_IMAGE_MODEL } from "@/lib/api-models";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

import { useSettingsStore } from "../store";
import {
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsInputClassName,
} from "./settings-ui";

export const DEFAULT_IMAGE_MODEL_OPTIONS = [
  { value: "gpt-image-2.5-flare", label: "gpt-image-2.5-flare（默认推荐）" },
  { value: "gpt-image-2.5-sunburst", label: "gpt-image-2.5-sunburst" },
  { value: "gpt-image-2.5", label: "gpt-image-2.5" },
  { value: "gpt-image-2", label: "gpt-image-2" },
  { value: "auto", label: "auto（自动调度）" },
] as const;

export const INTERNAL_MODEL_OPTIONS = [
  "auto",
  "gpt-5-5-thinking",
  "gpt-5-3",
  "gpt-5-3-mini",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5",
  "gpt-5-1",
  "gpt-5-2",
  "gpt-5-mini",
] as const;

export function ImageAccountPoolSettings() {
  const config = useSettingsStore((state) => state.config);
  const setImageProxyField = useSettingsStore(
    (state) => state.setImageProxyField
  );
  const setGPTImage2CreditCost = useSettingsStore(
    (state) => state.setGPTImage2CreditCost
  );
  const setGPTImage25CreditCost = useSettingsStore(
    (state) => state.setGPTImage25CreditCost
  );
  const setGPTImage25FlareCreditCost = useSettingsStore(
    (state) => state.setGPTImage25FlareCreditCost
  );
  const setGPTImage25SunburstCreditCost = useSettingsStore(
    (state) => state.setGPTImage25SunburstCreditCost
  );
  const setImageCreditCost1080p = useSettingsStore(
    (state) => state.setImageCreditCost1080p
  );
  const setImageCreditCost2k = useSettingsStore(
    (state) => state.setImageCreditCost2k
  );
  const setImageCreditCost4k = useSettingsStore(
    (state) => state.setImageCreditCost4k
  );
  const setGrokImageCreditCost1k = useSettingsStore(
    (state) => state.setGrokImageCreditCost1k
  );
  const setGrokImageCreditCost2k = useSettingsStore(
    (state) => state.setGrokImageCreditCost2k
  );
  const setVideoCreditCostPerSecond = useSettingsStore(
    (state) => state.setVideoCreditCostPerSecond
  );

  const [customSlug, setCustomSlug] = useState("");

  if (!config) {
    return null;
  }

  const defaultModel = String(config.image_default_model || DEFAULT_IMAGE_MODEL);
  const primarySlug = String(config.image_internal_model_slug || "gpt-5-3");
  const fallbackEnabled = config.image_fallback_model_enabled !== false;
  const fallbackModels = Array.isArray(config.image_fallback_model_slugs)
    ? config.image_fallback_model_slugs
    : [];

  const candidateOptions = INTERNAL_MODEL_OPTIONS.filter(
    (item) => item !== primarySlug
  );

  const updateFallbackModels = (next: string[]) => {
    setImageProxyField({ image_fallback_model_slugs: next });
  };

  const toggleCandidate = (slug: string) => {
    if (fallbackModels.includes(slug)) {
      if (fallbackModels.length <= 1) {
        toast.warning("开启备用轮询时至少保留 1 个备用模型");
        return;
      }
      updateFallbackModels(fallbackModels.filter((item) => item !== slug));
    } else {
      updateFallbackModels([...fallbackModels, slug]);
    }
  };

  const removeChip = (slug: string) => {
    if (fallbackModels.length <= 1) {
      toast.warning("开启备用轮询时至少保留 1 个备用模型");
      return;
    }
    updateFallbackModels(fallbackModels.filter((item) => item !== slug));
  };

  const moveChip = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= fallbackModels.length) return;
    const next = [...fallbackModels];
    const [picked] = next.splice(index, 1);
    next.splice(targetIndex, 0, picked);
    updateFallbackModels(next);
  };

  const addCustomSlug = () => {
    const trimmed = customSlug.trim();
    if (!trimmed) return;
    if (trimmed === primarySlug) {
      toast.warning("该模型已是当前首选路由模型，无需重复加入备用列表");
      return;
    }
    if (fallbackModels.includes(trimmed)) {
      toast.info(`备用列表中已包含「${trimmed}」`);
      setCustomSlug("");
      return;
    }
    if (
      !INTERNAL_MODEL_OPTIONS.includes(
        trimmed as (typeof INTERNAL_MODEL_OPTIONS)[number]
      )
    ) {
      toast.warning(
        `底层号池仅支持预置会话模型（如 ${INTERNAL_MODEL_OPTIONS.slice(0, 4).join(" / ")}）`
      );
      return;
    }
    updateFallbackModels([...fallbackModels, trimmed]);
    setCustomSlug("");
  };

  const handleCustomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isImeComposing(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomSlug();
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. 底层会话模型路由与故障降级 */}
      <SettingsSection
        layout="split"
        title="GPT 号池底层模型路由"
        description="指定默认生图模型、本地账号池发起生图会话的首选底层模型，以及失败后的自动降级轮询链路。"
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="image-default-model"
              className="block text-xs font-medium text-foreground sm:text-[13px]"
            >
              全站默认生图模型
            </label>
            <Select
              value={defaultModel}
              onValueChange={(value) =>
                setImageProxyField({ image_default_model: value })
              }
            >
              <SelectTrigger
                id="image-default-model"
                className={cn("w-full font-mono text-xs", settingsInputClassName)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_IMAGE_MODEL_OPTIONS.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="font-mono text-xs"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-4.5 text-muted-foreground">
              API 未传 model 时默认使用该标识；创作台可按需切换具体子模型。
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="image-internal-model-slug"
              className="block text-xs font-medium text-foreground sm:text-[13px]"
            >
              首选底层会话模型 Slug
            </label>
            <Select
              value={primarySlug}
              onValueChange={(value) => {
                const cleanedFallbacks = fallbackModels.filter(
                  (item) => item !== value
                );
                setImageProxyField({
                  image_internal_model_slug: value,
                  ...(cleanedFallbacks.length > 0 &&
                  cleanedFallbacks.length !== fallbackModels.length
                    ? { image_fallback_model_slugs: cleanedFallbacks }
                    : {}),
                });
              }}
            >
              <SelectTrigger
                id="image-internal-model-slug"
                className={cn("w-full font-mono text-xs", settingsInputClassName)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERNAL_MODEL_OPTIONS.map((model) => (
                  <SelectItem
                    key={model}
                    value={model}
                    className="font-mono text-xs"
                  >
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-4.5 text-muted-foreground">
              本地 GPT 号池执行生图会话时优先调度的内部会话模型。
            </p>
          </div>
        </div>

        <SettingsSwitchRow
          id="image-fallback-model-enabled"
          title="生图失败后自动轮询备用底层模型"
          description="首选底层模型返回限流或模型不可用时，按下方排列顺序依次尝试备用模型以提高出图成功率"
          checked={fallbackEnabled}
          onCheckedChange={(checked) =>
            setImageProxyField({ image_fallback_model_enabled: checked })
          }
        />

        {fallbackEnabled ? (
          <div className="space-y-3 rounded-xl border border-border/75 bg-surface-subtle/45 p-3.5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  已选备用轮询顺序（共 {fallbackModels.length} 项）
                </span>
                <span className="text-[11px] text-muted-foreground">
                  使用左右箭头调整失败降级优先级
                </span>
              </div>

              {fallbackModels.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-surface px-3 py-2 text-xs text-muted-foreground">
                  尚未选择备用模型，请点击下方候选标签添加。
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {fallbackModels.map((slug, index) => (
                    <div
                      key={slug}
                      className="inline-flex h-7.5 items-center gap-1 rounded-lg border border-border/85 bg-surface px-2 text-xs shadow-2xs"
                    >
                      <span className="rounded bg-surface-muted px-1 py-0.25 font-mono text-[10px] font-medium tabular-nums text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="px-0.5 font-mono text-xs font-medium text-foreground">
                        {slug}
                      </span>
                      <div className="ml-0.5 flex items-center border-l border-border/65 pl-1">
                        <button
                          type="button"
                          aria-label={`将 ${slug} 向前移动`}
                          title="提高优先级"
                          disabled={index === 0}
                          onClick={() => moveChip(index, -1)}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronLeft className="size-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`将 ${slug} 向后移动`}
                          title="降低优先级"
                          disabled={index === fallbackModels.length - 1}
                          onClick={() => moveChip(index, 1)}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronRight className="size-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`移除备用模型 ${slug}`}
                          title="移除"
                          onClick={() => removeChip(slug)}
                          className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-status-danger-soft hover:text-status-danger"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5 border-t border-border/60 pt-2.5">
              <div className="text-[11px] font-medium text-muted-foreground">
                点击候选模型一键加入或移出轮询池：
              </div>
              <div className="flex flex-wrap gap-1.5">
                {candidateOptions.map((slug) => {
                  const selected = fallbackModels.includes(slug);
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => toggleCandidate(slug)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 font-mono text-xs transition-colors",
                        selected
                          ? "border-foreground/80 bg-primary text-primary-foreground shadow-2xs"
                          : "border-border/80 bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
                      )}
                    >
                      <span>{slug}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border/60 pt-2.5 sm:flex-row sm:items-center">
              <Input
                list="fallback-slug-options"
                value={customSlug}
                onChange={(event) => setCustomSlug(event.target.value)}
                onKeyDown={handleCustomKeyDown}
                placeholder="输入模型 Slug 后按 Enter 添加（如 gpt-5.5）"
                className={cn(
                  settingsInputClassName,
                  "h-8.5 min-w-0 flex-1 font-mono text-xs"
                )}
              />
              <datalist id="fallback-slug-options">
                {candidateOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!customSlug.trim()}
                onClick={addCustomSlug}
                className="h-8.5 shrink-0 gap-1 px-3 text-xs"
              >
                <Plus className="size-3.5" />
                <span>添加至末尾</span>
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsSection>

      {/* 2. 本地号池生图与视频积分计费 */}
      <SettingsSection
        layout="split"
        title="本地号池积分计费标准"
        description="显式配置各内置 GPT 子模型、Grok 生图与视频单价；创作台预估与服务端实际扣费 1:1 同步。"
      >
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-border/70 bg-surface-subtle/35 p-3">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-foreground">
                GPT 内置子模型独立单价（按所选模型直接计费）
              </span>
              <span className="text-[11px] text-muted-foreground">
                优先于下方通用画质档位生效
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SettingsUnitInput
                id="pricing-gpt-image-2"
                label="GPT Image 2"
                unit="积分/张"
                min={1}
                description="gpt-image-2"
                value={config.gpt_image_2_credit_cost ?? config.image_credit_cost_1080p ?? 1}
                onChange={setGPTImage2CreditCost}
              />
              <SettingsUnitInput
                id="pricing-gpt-image-2-5"
                label="GPT Image 2.5"
                unit="积分/张"
                min={1}
                description="gpt-image-2.5"
                value={config.gpt_image_2_5_credit_cost ?? config.image_credit_cost_2k ?? 2}
                onChange={setGPTImage25CreditCost}
              />
              <SettingsUnitInput
                id="pricing-gpt-image-2-5-flare"
                label="GPT 2.5 Flare"
                unit="积分/张"
                min={1}
                description="gpt-image-2.5-flare"
                value={config.gpt_image_2_5_flare_credit_cost ?? config.image_credit_cost_4k ?? 3}
                onChange={setGPTImage25FlareCreditCost}
              />
              <SettingsUnitInput
                id="pricing-gpt-image-2-5-sunburst"
                label="GPT 2.5 Sunburst"
                unit="积分/张"
                min={1}
                description="gpt-image-2.5-sunburst"
                value={config.gpt_image_2_5_sunburst_credit_cost ?? config.image_credit_cost_4k ?? 3}
                onChange={setGPTImage25SunburstCreditCost}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              通用分辨率兜底档位（未绑定独立单价的其他/自定义模型使用）
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SettingsUnitInput
                id="pricing-gpt-1080p"
                label="标准画质兜底 (1K)"
                unit="积分/张"
                min={1}
                value={config.image_credit_cost_1080p ?? 1}
                onChange={setImageCreditCost1080p}
              />
              <SettingsUnitInput
                id="pricing-gpt-2k"
                label="高清画质兜底 (2K)"
                unit="积分/张"
                min={1}
                value={config.image_credit_cost_2k ?? 2}
                onChange={setImageCreditCost2k}
              />
              <SettingsUnitInput
                id="pricing-gpt-4k"
                label="超清画质兜底 (4K)"
                unit="积分/张"
                min={1}
                value={config.image_credit_cost_4k ?? 3}
                onChange={setImageCreditCost4k}
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="text-xs font-medium text-muted-foreground">
              Grok 生图与视频计费标准
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SettingsUnitInput
                id="pricing-grok-1k"
                label="Grok 标准生图 (1K)"
                unit="积分/张"
                min={1}
                value={config.grok_image_credit_cost_1k ?? 1}
                onChange={setGrokImageCreditCost1k}
              />
              <SettingsUnitInput
                id="pricing-grok-2k"
                label="Grok 高清生图 (2K)"
                unit="积分/张"
                min={1}
                value={config.grok_image_credit_cost_2k ?? 2}
                onChange={setGrokImageCreditCost2k}
              />
              <SettingsUnitInput
                id="pricing-grok-video-sec"
                label="Grok 视频每秒计费"
                unit="积分/秒"
                min={1}
                description="grok-imagine-video 按实际生成时长计费"
                value={config.video_credit_cost_per_second ?? 1}
                onChange={setVideoCreditCostPerSecond}
              />
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
