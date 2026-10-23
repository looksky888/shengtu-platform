"use client";

import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClearanceTestResult, RegisterClearanceConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  SettingsNotice,
  SettingsSection,
  settingsInputClassName,
} from "./settings-ui";

export function RegisterClearanceTestPanel({
  clearanceEnabled,
  mode,
  isRegisterRunning,
  isTesting,
  testTarget,
  testResult,
  onTargetChange,
  onTest,
}: {
  clearanceEnabled: boolean;
  mode: RegisterClearanceConfig["mode"];
  isRegisterRunning: boolean;
  isTesting: boolean;
  testTarget: string;
  testResult: ClearanceTestResult | null;
  onTargetChange: (value: string) => void;
  onTest: () => void;
}) {
  const canRunTest = !isRegisterRunning && clearanceEnabled && mode !== "none";

  return (
    <SettingsSection
      title="注册清障连通性自检"
      description="使用当前注册清障参数向目标站点发起探测，确认能够正常签发或通过 Cloudflare 校验。"
    >
      <div className="space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            className={cn(
              settingsInputClassName,
              "min-w-0 flex-1 font-mono text-xs sm:text-[13px]"
            )}
            value={testTarget}
            onChange={(event) => onTargetChange(event.target.value)}
            placeholder="https://chatgpt.com"
            disabled={!canRunTest}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isTesting}
            disabled={!canRunTest}
            onClick={onTest}
            className="h-9 shrink-0 gap-1.5 px-3 text-xs"
          >
            <ShieldCheck className="size-3.5" />
            <span>测试 Clearance</span>
          </Button>
        </div>

        {testResult ? (
          <SettingsNotice
            tone={testResult.ok ? "success" : "danger"}
            className="tabular-nums"
          >
            {testResult.ok
              ? `验证通过 · 耗时 ${testResult.latency_ms} ms · 获取 ${testResult.cookie_count ?? 0} 枚 Cookie`
              : `验证失败：${testResult.error ?? testResult.status ?? "未知错误"}`}
          </SettingsNotice>
        ) : null}
      </div>
    </SettingsSection>
  );
}
