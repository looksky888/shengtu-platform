"use client";

import { RefreshCw, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useSettingsStore } from "../store";
import {
  pricingErrors,
  useChannelRoutingPricingDirty,
} from "./image-account-pool-pricing";
import { ImageAccountPoolSettings } from "./image-account-pool-settings";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsEmptyState,
} from "./settings-ui";

export function ImageAccountPoolRoutingCard({
  registerDirty = true,
}: {
  registerDirty?: boolean;
} = {}) {
  const config = useSettingsStore((state) => state.config);
  const loading = useSettingsStore((state) => state.isLoadingConfig);
  const saving = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const loadConfig = useSettingsStore((state) => state.loadConfig);

  const {
    sectionDirty,
    saveRoutingPricing,
    resetRoutingPricing,
  } = useChannelRoutingPricingDirty(registerDirty);

  const isSavingSection =
    saving &&
    (savingSectionKey === "image-routing-pricing" ||
      savingSectionKey === "__all__");

  const currentErrors = pricingErrors(
    config as Record<string, unknown> | null | undefined,
  );
  const hasValidationError = Object.keys(currentErrors).length > 0;

  const handleSave = async () => {
    await saveRoutingPricing();
  };

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
            hint={
              hasValidationError
                ? "请先修正标红的积分单价（需为 ≥ 1 的整数）后再保存"
                : undefined
            }
            onReset={resetRoutingPricing}
            onSave={() => void handleSave()}
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
