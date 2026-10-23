"use client";

import { Cloud, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { testProxyClearance, type ClearanceTestResult } from "@/lib/api";
import { cn } from "@/lib/utils";

import { registerConfigSnapshot } from "../settings-dirty";
import { useSettingsStore } from "../store";
import { RegisterClearanceForm } from "./register-clearance-form";
import { RegisterClearanceTestPanel } from "./register-clearance-test-panel";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsEmptyState,
  SettingsNotice,
} from "./settings-ui";

function modeLabel(mode: string) {
  if (mode === "flaresolverr") return "FlareSolverr 自动过盾";
  if (mode === "manual") return "手动凭据注入";
  return "无清障";
}

export function RegisterClearanceCard() {
  const config = useSettingsStore((state) => state.registerConfig);
  const savedRegisterSnapshot = useSettingsStore(
    (state) => state.savedRegisterSnapshot
  );
  const isLoading = useSettingsStore((state) => state.isLoadingRegister);
  const isSaving = useSettingsStore((state) => state.isSavingRegister);
  const loadRegister = useSettingsStore((state) => state.loadRegister);
  const setClearance = useSettingsStore((state) => state.setRegisterClearance);
  const save = useSettingsStore((state) => state.saveRegister);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ClearanceTestResult | null>(
    null
  );
  const [testTarget, setTestTarget] = useState("https://chatgpt.com");

  if (isLoading) {
    return (
      <SettingsCard
        icon={Cloud}
        title="自动化注册机清障（Cloudflare）"
        description="独立管理自动化注册任务的 FlareSolverr 与手动过盾凭据，与左栏生图上游互不覆盖"
        tone="amber"
      >
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-2.5">
            <Skeleton className="h-18 w-full" />
            <Skeleton className="h-18 w-full" />
            <Skeleton className="h-18 w-full" />
            <Skeleton className="h-18 w-full" />
          </div>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </SettingsCard>
    );
  }

  if (!config) {
    return (
      <SettingsCard
        icon={Cloud}
        title="自动化注册机清障（Cloudflare）"
        description="独立管理自动化注册任务的 FlareSolverr 与手动过盾凭据，与左栏生图上游互不覆盖"
        tone="amber"
      >
        <SettingsEmptyState
          icon={Cloud}
          title="注册清障配置暂不可用"
          description="未能读取自动化注册服务配置，请检查注册模块连接状态后点击重试。"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadRegister()}
            >
              <RefreshCw className="size-3.5" />
              <span>重新加载注册清障配置</span>
            </Button>
          }
        />
      </SettingsCard>
    );
  }

  const clearance = config.clearance || {
    enabled: false,
    mode: "none" as const,
    flaresolverr_url: "",
    timeout_seconds: 60,
    refresh_interval_seconds: 3600,
    proxy: "",
    user_agent: "",
    cf_clearance: "",
    cf_cookies: "",
  };
  const isRegisterRunning = Boolean(config.enabled);
  const mode = clearance.mode || "none";
  const hasCookie = Boolean(
    clearance.cf_credentials_configured ||
      String(clearance.cf_clearance || "").trim() ||
      String(clearance.cf_cookies || "").trim()
  );
  const hasFlare = Boolean(String(clearance.flaresolverr_url || "").trim());

  const isRegisterDirty = Boolean(
    savedRegisterSnapshot &&
      registerConfigSnapshot(config) !== savedRegisterSnapshot
  );

  const summaryItems = [
    {
      label: "注册清障开关",
      value: clearance.enabled ? "已开启" : "未启用",
      sub: isRegisterRunning ? "注册任务运行中（已锁定）" : "空闲可编辑",
      tone: clearance.enabled ? ("success" as const) : ("neutral" as const),
    },
    {
      label: "当前工作模式",
      value: modeLabel(mode),
      sub:
        mode === "flaresolverr"
          ? "容器自动续期会话"
          : mode === "manual"
            ? "人工提取静态凭据"
            : "不附加额外凭据",
      tone:
        clearance.enabled && mode !== "none"
          ? ("success" as const)
          : ("neutral" as const),
    },
    {
      label:
        mode === "manual" ? "手动 Cookie 状态" : "FlareSolverr 地址",
      value:
        mode === "manual"
          ? hasCookie
            ? "凭据已配置"
            : "待填写凭据"
          : hasFlare
            ? "地址已配置"
            : "未填写 URL",
      sub:
        mode === "manual"
          ? "cf_clearance 与浏览器 UA"
          : clearance.flaresolverr_url || "尚未指定服务地址",
      tone:
        mode === "manual"
          ? hasCookie
            ? ("success" as const)
            : ("warning" as const)
          : mode === "flaresolverr"
            ? hasFlare
              ? ("success" as const)
              : ("warning" as const)
            : ("neutral" as const),
    },
    {
      label: "自动续期周期",
      value:
        Number(clearance.refresh_interval_seconds) > 0
          ? `${clearance.refresh_interval_seconds} 秒`
          : "不自动轮询",
      sub: `单次超时 ${clearance.timeout_seconds || 60} 秒`,
      tone: "neutral" as const,
    },
  ];

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      if (isRegisterDirty) {
        const ok = await save();
        if (!ok) return;
      }
      const data = await testProxyClearance(
        testTarget.trim() || "https://chatgpt.com"
      );
      setTestResult(data.result);
      if (data.result.ok) {
        toast.success(`注册清障测试成功（${data.result.latency_ms} ms）`);
      } else {
        toast.error(
          `注册清障测试失败：${data.result.error ?? data.result.status}`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "测试 Clearance 失败"
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <SettingsCard
      icon={Cloud}
      title="自动化注册机清障（Cloudflare）"
      description="独立管理自动化注册任务的 FlareSolverr 与手动过盾凭据，与左栏生图上游互不覆盖"
      tone="amber"
      meta={
        <Badge
          variant="outline"
          className={cn(
            "h-5 gap-1.5 px-2 text-[11px]",
            clearance.enabled && mode !== "none"
              ? "border-status-success/25 bg-status-success-soft font-medium text-status-success"
              : "border-border/75 bg-surface-subtle text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              clearance.enabled && mode !== "none"
                ? "bg-status-success"
                : "bg-muted-foreground/60"
            )}
          />
          {clearance.enabled ? modeLabel(mode) : "清障未启用"}
        </Badge>
      }
      footer={
        <SettingsCardSaveFooter
          dirty={isRegisterDirty}
          saving={isSaving}
          disabled={isRegisterRunning || isTesting}
          hint={
            isRegisterRunning
              ? "自动化注册任务正在运行，请先停止注册任务后再修改保存"
              : undefined
          }
          onReset={() => void loadRegister({ silent: true })}
          onSave={() => void save()}
        />
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-xl border border-border/75 bg-surface-subtle/50 p-3"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    item.tone === "success" && "bg-status-success",
                    item.tone === "warning" && "bg-status-warning",
                    item.tone === "neutral" && "bg-muted-foreground/55"
                  )}
                />
                <span>{item.label}</span>
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {item.value}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {item.sub}
              </div>
            </div>
          ))}
        </div>

        {isRegisterRunning ? (
          <SettingsNotice tone="warning">
            检测到自动化注册任务正在运行，当前表单已暂时锁定为只读，避免运行中途覆盖会话凭据。如需调整参数请先前往注册控制台停止任务。
          </SettingsNotice>
        ) : null}

        <RegisterClearanceForm
          clearance={clearance}
          mode={mode}
          isRegisterRunning={isRegisterRunning}
          onChange={setClearance}
        />

        <RegisterClearanceTestPanel
          clearanceEnabled={Boolean(clearance.enabled)}
          mode={mode}
          isRegisterRunning={isRegisterRunning}
          isTesting={isTesting}
          testTarget={testTarget}
          testResult={testResult}
          onTargetChange={setTestTarget}
          onTest={() => void handleTest()}
        />

        <SettingsNotice>
          保存此处配置后，自动化注册工作台只需开启「Cloudflare 过盾」开关即可直接复用；生图与视频号池的清障请在左侧卡片单独维护。
        </SettingsNotice>
      </div>
    </SettingsCard>
  );
}
