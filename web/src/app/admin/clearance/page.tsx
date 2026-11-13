"use client";

import { useCallback } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { UpstreamProxyRuntimeCard } from "@/app/settings/components/upstream-proxy-runtime-card";
import { isConfigKeysDirty } from "@/app/settings/settings-dirty";
import { useRegisterSettingsDirty } from "@/app/settings/settings-dirty-registry-hooks";
import { useSettingsStore } from "@/app/settings/store";
import { useEnsureSettingsConfigLoaded } from "@/app/settings/use-ensure-settings-config";
import {
  AdminPageFrame,
  AdminStatTile,
  AdminStickyCommandBar,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import type { SettingsConfig } from "@/lib/settings-types";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

const UPSTREAM_PROXY_KEYS: readonly (keyof SettingsConfig)[] = [
  "proxy",
  "flaresolverr_url",
  "upstream_clearance_enabled",
  "upstream_clearance_mode",
  "upstream_clearance_timeout_sec",
  "upstream_clearance_refresh_interval",
  "upstream_clearance_warm_up_on_start",
  "image_challenge_cooldown_seconds",
];

export default function AdminClearancePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/clearance");

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore((state) => state.savedConfigSnapshot);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);
  const resetConfigSection = useSettingsStore((state) => state.resetConfigSection);

  useEnsureSettingsConfigLoaded(Boolean(session));

  const dirty = isConfigKeysDirty(config, savedConfigSnapshot, UPSTREAM_PROXY_KEYS);

  const handleSave = useCallback(async () => {
    const receipt = await saveConfigSection(UPSTREAM_PROXY_KEYS, {
      sectionKey: "upstream-proxy",
    });
    return Boolean(receipt);
  }, [saveConfigSection]);

  useRegisterSettingsDirty({
    id: "admin-page-clearance",
    tab: "base",
    label: "过盾与代理",
    isDirty: dirty,
    save: handleSave,
    discard: () => {
      resetConfigSection(UPSTREAM_PROXY_KEYS);
      return true;
    },
  });

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  const proxyConfigured = Boolean(config?.proxy?.trim());
  const clearanceEnabled = Boolean(config?.upstream_clearance_enabled);
  const clearanceMode = config?.upstream_clearance_mode || "none";
  const clearanceLabel =
    !clearanceEnabled || clearanceMode === "none"
      ? "Off（未启用）"
      : clearanceMode === "flaresolverr"
        ? "FlareSolverr 自动过盾"
        : "手动凭据复用";

  return (
    <AdminPageFrame
      groupLabel="算力与号池"
      title="过盾与代理"
      description="配置上游出站 HTTP / SOCKS5 代理、WARP 出口链路与 FlareSolverr 自动过盾会话预热。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoadingConfig}
          onClick={() => void loadConfig()}
        >
          <RefreshCw className={cn("size-3.5", isLoadingConfig && "animate-spin")} />
          刷新状态
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="上游出站代理"
          value={proxyConfigured ? "已配置" : "直连出站"}
          tone={proxyConfigured ? "success" : "default"}
          hint={config?.proxy?.trim() || "未配置全局代理，使用主机默认网络"}
        />
        <AdminStatTile
          label="Cloudflare 清障模式"
          value={clearanceLabel}
          tone={clearanceEnabled && clearanceMode !== "none" ? "info" : "default"}
          hint={config?.flaresolverr_url || "支持 FlareSolverr 自动挑战求解"}
        />
        <AdminStatTile
          label="超时与凭据刷新周期"
          value={`${config?.upstream_clearance_timeout_sec ?? 60}s / ${config?.upstream_clearance_refresh_interval ?? 3600}s`}
          hint={`挑战冷却 ${config?.image_challenge_cooldown_seconds ?? 900}s`}
        />
      </div>

      <AdminStickyCommandBar
        dirty={dirty}
        saving={isSavingConfig}
        cleanSummary="上游代理与 FlareSolverr 清障参数已同步，支持下方实时连通性与过盾测试"
        dirtySummary="上游代理或清障参数有未保存修改"
        onSave={() => void handleSave()}
        onReset={() => resetConfigSection(UPSTREAM_PROXY_KEYS)}
      />

      <UpstreamProxyRuntimeCard hideFooter />
    </AdminPageFrame>
  );
}
