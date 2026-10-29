"use client";

import { RefreshCw, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SettingsConfig } from "@/lib/api";

import { isConfigKeysDirty } from "../settings-dirty";
import { useSettingsStore } from "../store";
import { ImageAccountPoolSettings } from "./image-account-pool-settings";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsEmptyState,
} from "./settings-ui";

const ROUTING_AND_PRICING_KEYS: readonly (keyof SettingsConfig)[] = [
  "image_default_model",
  "image_internal_model_slug",
  "image_fallback_model_enabled",
  "image_fallback_model_slugs",
  "gpt_image_2_credit_cost",
  "gpt_image_2_5_credit_cost",
  "gpt_image_2_5_flare_credit_cost",
  "gpt_image_2_5_sunburst_credit_cost",
  "image_credit_cost_1080p",
  "image_credit_cost_2k",
  "image_credit_cost_4k",
  "grok_image_credit_cost_1k",
  "grok_image_credit_cost_2k",
  "video_credit_cost_per_second",
];

export function ImageAccountPoolRoutingCard() {
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const loading = useSettingsStore((state) => state.isLoadingConfig);
  const saving = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );

  const sectionDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    ROUTING_AND_PRICING_KEYS
  );
  const isSavingSection =
    saving &&
    (savingSectionKey === "image-routing-pricing" ||
      savingSectionKey === "__all__");

  return (
    <SettingsCard
      icon={Route}
      title="本地号池路由与积分计费"
      description="管理本地账号池默认生图模型、底层降级链路，以及各 GPT 子模型、Grok 与视频的独立积分定价"
      tone="slate"
      footer={
        config ? (
          <SettingsCardSaveFooter
            dirty={sectionDirty}
            saving={isSavingSection}
            disabled={saving}
            onReset={() => resetConfigSection(ROUTING_AND_PRICING_KEYS)}
            onSave={() =>
              void saveConfigSection(ROUTING_AND_PRICING_KEYS, {
                sectionKey: "image-routing-pricing",
              })
            }
          />
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-4 py-1">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !config ? (
        <SettingsEmptyState
          icon={Route}
          title="路由与计费配置加载失败"
          description="未能从服务端获取号池路由与积分计费参数，请点击重试。"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadConfig()}
            >
              <RefreshCw className="size-3.5" />
              <span>重新加载</span>
            </Button>
          }
        />
      ) : (
        <ImageAccountPoolSettings />
      )}
    </SettingsCard>
  );
}
