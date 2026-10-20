"use client";

import { LoaderCircle, Route, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SettingsConfig } from "@/lib/api";

import { useSettingsStore } from "../store";
import { ImageAccountPoolSettings } from "./image-account-pool-settings";
import { SettingsCard } from "./settings-ui";

// 生图默认模型由服务端锁定为 gpt-image-2.5-flare，不在本卡片内保存。
const routingKeys: readonly (keyof SettingsConfig)[] = [
  "image_internal_model_slug",
  "image_fallback_model_enabled",
  "image_fallback_model_slugs",
];

export function ImageAccountPoolRoutingCard() {
  const config = useSettingsStore((state) => state.config);
  const loading = useSettingsStore((state) => state.isLoadingConfig);
  const saving = useSettingsStore((state) => state.isSavingConfig);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);

  return (
    <SettingsCard
      icon={Route}
      title="本地号池路由"
      tone="slate"
      action={<Button type="button" disabled={loading || saving || !config} onClick={() => void saveConfigSection(routingKeys)}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存</Button>}
    >
      {loading || !config ? <div className="flex min-h-32 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div> : <ImageAccountPoolSettings />}
    </SettingsCard>
  );
}
