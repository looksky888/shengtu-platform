import { toast } from "sonner";

import type { SettingsConfig } from "@/lib/settings-types";

import { isConfigKeysDirty } from "../settings-dirty";
import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { useSettingsStore } from "../store";

export type PricingRule = {
  key: keyof SettingsConfig;
  label: string;
  fallback: number;
};

export const PRICING_RULES: readonly PricingRule[] = [
  { key: "gpt_image_2_6_flare_credit_cost", label: "GPT 2.6 Flare 单价", fallback: 5 },
  { key: "gpt_image_2_6_credit_cost", label: "GPT Image 2.6 单价", fallback: 5 },
  { key: "gpt_image_2_6_sunburst_credit_cost", label: "GPT 2.6 Sunburst 单价", fallback: 5 },
  { key: "gpt_image_2_credit_cost", label: "GPT Image 2 单价", fallback: 1 },
  { key: "gpt_image_2_5_credit_cost", label: "GPT Image 2.5 单价", fallback: 2 },
  { key: "gpt_image_2_5_flare_credit_cost", label: "GPT 2.5 Flare 单价", fallback: 3 },
  { key: "gpt_image_2_5_sunburst_credit_cost", label: "GPT 2.5 Sunburst 单价", fallback: 3 },
  { key: "image_credit_cost_1080p", label: "标准画质兜底 (1K) 单价", fallback: 1 },
  { key: "image_credit_cost_2k", label: "高清画质兜底 (2K) 单价", fallback: 2 },
  { key: "image_credit_cost_4k", label: "超清画质兜底 (4K) 单价", fallback: 3 },
  { key: "grok_image_credit_cost_1k", label: "Grok 标准生图 (1K) 单价", fallback: 1 },
  { key: "grok_image_credit_cost_2k", label: "Grok 高清生图 (2K) 单价", fallback: 2 },
  { key: "video_credit_cost_per_second", label: "Grok 视频每秒单价", fallback: 1 },
] as const;

export function pricingErrors(
  config: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!config) return {};
  const errors: Record<string, string> = {};
  for (const rule of PRICING_RULES) {
    const raw = config[rule.key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    const num = text === "" ? Number.NaN : Number(text);
    if (!Number.isInteger(num) || num < 1 || num > 1000000) {
      errors[rule.key] = `${rule.label}必须为不小于 1 的整数`;
    }
  }
  return errors;
}

export const ROUTING_AND_PRICING_KEYS: readonly (keyof SettingsConfig)[] = [
  "image_default_model",
  "image_internal_model_slug",
  "image_fallback_model_enabled",
  "image_fallback_model_slugs",
  "gpt_image_2_credit_cost",
  "gpt_image_2_5_credit_cost",
  "gpt_image_2_5_flare_credit_cost",
  "gpt_image_2_5_sunburst_credit_cost",
  "gpt_image_2_6_credit_cost",
  "gpt_image_2_6_flare_credit_cost",
  "gpt_image_2_6_sunburst_credit_cost",
  "image_credit_cost_1080p",
  "image_credit_cost_2k",
  "image_credit_cost_4k",
  "grok_image_credit_cost_1k",
  "grok_image_credit_cost_2k",
  "video_credit_cost_per_second",
];

export function useChannelRoutingPricingDirty(enabled = true) {
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection,
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection,
  );

  const sectionDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    ROUTING_AND_PRICING_KEYS,
  );

  const validateRoutingPricing = () => {
    const latestConfig = useSettingsStore.getState().config as
      | Record<string, unknown>
      | null
      | undefined;
    const errs = pricingErrors(latestConfig);
    const firstMsg = Object.values(errs)[0];
    if (firstMsg) {
      toast.error(firstMsg);
      return false;
    }
    return true;
  };

  useRegisterSettingsDirty({
    id: enabled ? "channels:routing-pricing" : "channels:routing-pricing:noop",
    tab: "channels",
    label: "本地号池路由与积分计费",
    isDirty: enabled ? sectionDirty : false,
    validate: validateRoutingPricing,
    save: async () => {
      if (!enabled) return true;
      if (!validateRoutingPricing()) return false;
      const receipt = await saveConfigSection(ROUTING_AND_PRICING_KEYS, {
        sectionKey: "image-routing-pricing",
      });
      return receipt !== null;
    },
    discard: () => {
      if (enabled) {
        resetConfigSection(ROUTING_AND_PRICING_KEYS);
      }
      return true;
    },
  });

  return {
    sectionDirty,
    validateRoutingPricing,
    saveRoutingPricing: async () => {
      if (!validateRoutingPricing()) return false;
      const receipt = await saveConfigSection(ROUTING_AND_PRICING_KEYS, {
        sectionKey: "image-routing-pricing",
      });
      return receipt !== null;
    },
    resetRoutingPricing: () => resetConfigSection(ROUTING_AND_PRICING_KEYS),
  };
}
