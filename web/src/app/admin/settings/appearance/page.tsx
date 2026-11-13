"use client";

import { useCallback } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { CanvasLinkCard } from "@/app/settings/components/canvas-link-card";
import { ConfigCard } from "@/app/settings/components/config-card";
import { capacityErrors } from "@/app/settings/components/config-card-validation";
import { LoginVisualCard } from "@/app/settings/components/login-visual-card";
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
import { canvasLink } from "@/lib/canvas-link";
import type { SettingsConfig } from "@/lib/settings-types";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

const LOGIN_VISUAL_KEYS: readonly (keyof SettingsConfig)[] = [
  "login_page_image_url",
  "login_page_image_mode",
  "login_page_image_zoom",
  "login_page_image_position_x",
  "login_page_image_position_y",
];

const NON_LOGIN_APPEARANCE_KEYS: readonly (keyof SettingsConfig)[] = [
  "base_url",
  "canvas_url",
  "refresh_account_interval_minute",
  "image_concurrent_limit",
  "image_account_concurrency",
  "image_task_timeout_seconds",
  "image_account_schedule",
  "image_parallel_generation",
  "auto_remove_invalid_accounts",
  "auto_remove_rate_limited_accounts",
];

const APPEARANCE_AND_BASE_KEYS: readonly (keyof SettingsConfig)[] = [
  "base_url",
  "canvas_url",
  "login_page_image_url",
  "login_page_image_mode",
  "login_page_image_zoom",
  "login_page_image_position_x",
  "login_page_image_position_y",
  "refresh_account_interval_minute",
  "image_concurrent_limit",
  "image_account_concurrency",
  "image_task_timeout_seconds",
  "image_account_schedule",
  "image_parallel_generation",
  "auto_remove_invalid_accounts",
  "auto_remove_rate_limited_accounts",
];

export default function AdminAppearanceSettingsPage() {
  const { isCheckingAuth, session } = useAuthGuard(
    undefined,
    "/admin/settings/appearance",
  );

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const pendingLoginImageFile = useSettingsStore(
    (state) => state.pendingLoginImageFile,
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection,
  );
  const saveLoginPageVisual = useSettingsStore(
    (state) => state.saveLoginPageVisual,
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection,
  );

  useEnsureSettingsConfigLoaded(Boolean(session));

  const loginVisualDirty =
    Boolean(pendingLoginImageFile) ||
    isConfigKeysDirty(config, savedConfigSnapshot, LOGIN_VISUAL_KEYS);
  const nonLoginDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    NON_LOGIN_APPEARANCE_KEYS,
  );
  const dirty = loginVisualDirty || nonLoginDirty;

  const validateNonLoginAppearance = useCallback(() => {
    if (!config) return true;
    const rawCanvasUrl = String(config.canvas_url || "").trim();
    if (rawCanvasUrl && !canvasLink(rawCanvasUrl)) {
      toast.error("请填写不含账号密码的完整 HTTP/HTTPS 无限画布链接");
      return false;
    }
    const allErrors = capacityErrors(config as Record<string, unknown>);
    const scopedErrorKey = NON_LOGIN_APPEARANCE_KEYS.find((key) =>
      Boolean(allErrors[key]),
    );
    if (scopedErrorKey) {
      toast.error(allErrors[scopedErrorKey]);
      return false;
    }
    return true;
  }, [config]);

  useRegisterSettingsDirty({
    id: "admin-page-appearance-config",
    tab: "base",
    label: "站点外观与基础调度",
    isDirty: nonLoginDirty,
    validate: validateNonLoginAppearance,
    save: async () => {
      if (!validateNonLoginAppearance()) return false;
      const receipt = await saveConfigSection(NON_LOGIN_APPEARANCE_KEYS, {
        sectionKey: "appearance-base",
      });
      return Boolean(receipt);
    },
    discard: () => {
      resetConfigSection(NON_LOGIN_APPEARANCE_KEYS);
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

  const hasCanvasUrl = Boolean(config?.canvas_url?.trim());
  const hasLoginVisual = Boolean(
    pendingLoginImageFile || config?.login_page_image_url?.trim(),
  );

  const handleSaveAll = async () => {
    if (!config) return;

    const rawCanvasUrl = String(config.canvas_url || "").trim();
    if (rawCanvasUrl && !canvasLink(rawCanvasUrl)) {
      toast.error("请填写不含账号密码的完整 HTTP/HTTPS 无限画布链接");
      return;
    }

    const allErrors = capacityErrors(config as Record<string, unknown>);
    const scopedErrorKey = APPEARANCE_AND_BASE_KEYS.find((key) =>
      Boolean(allErrors[key]),
    );
    if (scopedErrorKey) {
      toast.error(allErrors[scopedErrorKey]);
      return;
    }

    if (loginVisualDirty) {
      const ok = await saveLoginPageVisual({
        sectionKey: "appearance-base",
        silentToast: nonLoginDirty,
      });
      if (!ok) return;
      if (!nonLoginDirty) return;
      await saveConfigSection(NON_LOGIN_APPEARANCE_KEYS, {
        sectionKey: "appearance-base",
      });
      return;
    }

    await saveConfigSection(APPEARANCE_AND_BASE_KEYS, {
      sectionKey: "appearance-base",
    });
  };

  return (
    <AdminPageFrame
      groupLabel="系统配置"
      title="站点与外观"
      description="配置站点公网基准地址、顶部导航「无限画布」外跳入口、登录页艺术视觉展示与核心号池调度参数。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoadingConfig}
          onClick={() => void loadConfig()}
        >
          <RefreshCw className={cn("size-3.5", isLoadingConfig && "animate-spin")} />
          刷新配置
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="站点公网基准地址"
          value={config?.base_url?.trim() ? "已配置" : "自动推导"}
          tone={config?.base_url?.trim() ? "success" : "default"}
          hint={config?.base_url?.trim() || "未填写时按请求 Host 自动推导"}
        />
        <AdminStatTile
          label="无限画布外跳入口"
          value={hasCanvasUrl ? "已开启" : "未挂载"}
          tone={hasCanvasUrl ? "info" : "default"}
          hint={config?.canvas_url?.trim() || "配置后显示在创作台顶部导航"}
        />
        <AdminStatTile
          label="登录页艺术陈列"
          value={hasLoginVisual ? "自定义主视觉" : "默认内置主题"}
          tone={hasLoginVisual ? "success" : "default"}
          hint={`展示模式：${config?.login_page_image_mode || "cover"}`}
        />
      </div>

      <AdminStickyCommandBar
        dirty={dirty}
        saving={isSavingConfig}
        cleanSummary="站点外观、无限画布入口与基础号池调度配置已同步"
        dirtySummary="站点外观或基础调度参数有未保存修改"
        onSave={() => void handleSaveAll()}
        onReset={() => resetConfigSection(APPEARANCE_AND_BASE_KEYS)}
      />

      <div className="space-y-5">
        <CanvasLinkCard hideFooter />
        <LoginVisualCard hideFooter />
        <ConfigCard mode="appearance" hideFooter />
      </div>
    </AdminPageFrame>
  );
}
