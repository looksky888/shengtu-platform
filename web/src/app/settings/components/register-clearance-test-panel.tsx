import { LoaderCircle, PlugZap, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClearanceTestResult, RegisterClearanceConfig } from "@/lib/api";

import { SettingsNotice, settingsInputClassName } from "./settings-ui";

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
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PlugZap className="size-4 text-sky-600" />
        连通性自检
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Input
          className={`${settingsInputClassName} font-mono text-xs`}
          value={testTarget}
          onChange={(event) => onTargetChange(event.target.value)}
          placeholder="https://chatgpt.com"
          disabled={isRegisterRunning || !clearanceEnabled || mode === "none"}
        />
        <Button
          type="button"
          variant="outline"
          disabled={isTesting || isRegisterRunning || !clearanceEnabled || mode === "none"}
          onClick={onTest}
        >
          {isTesting ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          测试 Clearance
        </Button>
      </div>
      {testResult ? (
        <SettingsNotice
          className={
            testResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }
        >
          {testResult.ok
            ? `OK · ${testResult.latency_ms} ms · cookies ${testResult.cookie_count ?? 0}`
            : testResult.error ?? testResult.status}
        </SettingsNotice>
      ) : null}
    </div>
  );
}
