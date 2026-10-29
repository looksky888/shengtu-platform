"use client";

import { useState } from "react";
import { ArrowUpRight, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canvasLink } from "@/lib/canvas-link";
import type { SettingsConfig } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

import { isConfigKeysDirty } from "../settings-dirty";
import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { useSettingsStore } from "../store";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  settingsInputClassName,
} from "./settings-ui";

const CANVAS_KEYS: readonly (keyof SettingsConfig)[] = ["canvas_url"];

export function CanvasLinkCard() {
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const setCanvasUrl = useSettingsStore((state) => state.setCanvasUrl);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );

  const [error, setError] = useState("");
  const value = String(config?.canvas_url || "");
  const normalizedUrl = canvasLink(value);
  const hasRawInput = value.trim().length > 0;
  const inlineError =
    error ||
    (hasRawInput && !normalizedUrl
      ? "请填写不含账号密码的完整 HTTP/HTTPS 链接"
      : "");

  const sectionDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    CANVAS_KEYS
  );
  const isSavingSection =
    isSavingConfig &&
    (savingSectionKey === "canvas-url" || savingSectionKey === "__all__");

  useRegisterSettingsDirty({
    id: "canvas-url-validator",
    tab: "base",
    label: "无限画布入口",
    isDirty: false,
    validate: () => {
      if (value.trim() && !canvasLink(value)) {
        setError("请填写不含账号密码的完整 HTTP/HTTPS 链接");
        toast.error("无限画布入口地址格式无效");
        return false;
      }
      setError("");
      return true;
    },
  });

  const handleSave = async () => {
    if (value.trim() && !normalizedUrl) {
      const msg = "请填写不含账号密码的完整 HTTP/HTTPS 链接";
      setError(msg);
      toast.error(msg);
      return;
    }
    setError("");
    await saveConfigSection(CANVAS_KEYS, { sectionKey: "canvas-url" });
  };

  return (
    <SettingsCard
      icon={ExternalLink}
      title="无限画布外部入口"
      description="配置顶部导航栏「无限画布」快捷跳转链接，留空则自动隐藏导航入口"
      meta={
        <Badge
          variant="outline"
          className={cn(
            "h-5 gap-1.5 px-2 text-[11px]",
            normalizedUrl
              ? "border-status-success/25 bg-status-success-soft font-medium text-status-success"
              : "border-border/75 bg-surface-subtle text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              normalizedUrl ? "bg-status-success" : "bg-muted-foreground/60"
            )}
          />
          {normalizedUrl ? "导航入口已启用" : "未配置（隐藏入口）"}
        </Badge>
      }
      footer={
        <SettingsCardSaveFooter
          dirty={sectionDirty}
          saving={isSavingSection}
          disabled={!config || isSavingConfig}
          hint={
            inlineError
              ? "请填写合法的 HTTP/HTTPS 地址后再保存"
              : undefined
          }
          onReset={() => {
            setError("");
            resetConfigSection(CANVAS_KEYS);
          }}
          onSave={() => void handleSave()}
        />
      }
    >
      <div className="space-y-2">
        <label
          htmlFor="canvas-entry-url"
          className="block text-xs font-medium text-foreground sm:text-[13px]"
        >
          画布访问地址
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Input
            id="canvas-entry-url"
            type="url"
            value={value}
            disabled={!config || isSavingConfig}
            maxLength={2048}
            placeholder="https://canvas.example.com/"
            aria-invalid={Boolean(inlineError)}
            aria-describedby="canvas-entry-hint"
            onChange={(event) => {
              setCanvasUrl(event.target.value);
              if (error) setError("");
            }}
            className={cn("h-9 min-w-0 flex-1", settingsInputClassName)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!config || isSavingConfig || !value}
            onClick={() => {
              setCanvasUrl("");
              setError("");
            }}
            className="h-9 shrink-0 gap-1 px-3 text-xs"
          >
            <X className="size-3.5" />
            <span>清空</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!normalizedUrl}
            onClick={() => {
              if (!normalizedUrl) return;
              window.open(normalizedUrl, "_blank", "noopener,noreferrer");
            }}
            className="h-9 shrink-0 gap-1 px-3 text-xs"
          >
            <span>新窗口测试</span>
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
        {inlineError ? (
          <p role="alert" className="text-xs leading-4 text-status-danger">
            {inlineError}
          </p>
        ) : (
          <p
            id="canvas-entry-hint"
            className="text-[11px] leading-4.5 text-muted-foreground"
          >
            留空将在导航栏隐藏「无限画布」入口；启用后点击将在新标签页打开独立画布站点（登录态与积分按目标站点独立管理）。
          </p>
        )}
      </div>
    </SettingsCard>
  );
}
