"use client";

import { Cloud, LoaderCircle, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { testProxyClearance, type ClearanceTestResult } from "@/lib/api";

import { useSettingsStore } from "../store";
import { RegisterClearanceForm } from "./register-clearance-form";
import { RegisterClearanceTestPanel } from "./register-clearance-test-panel";
import { SettingsCard, SettingsNotice } from "./settings-ui";

function modeLabel(mode: string) {
  if (mode === "flaresolverr") return "FlareSolverr 自动";
  if (mode === "manual") return "手动 Cookie";
  return "不处理";
}

export function RegisterClearanceCard() {
  const config = useSettingsStore((state) => state.registerConfig);
  const isLoading = useSettingsStore((state) => state.isLoadingRegister);
  const isSaving = useSettingsStore((state) => state.isSavingRegister);
  const setClearance = useSettingsStore((state) => state.setRegisterClearance);
  const save = useSettingsStore((state) => state.saveRegister);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ClearanceTestResult | null>(null);
  const [testTarget, setTestTarget] = useState("https://chatgpt.com");

  if (isLoading) {
    return (
      <SettingsCard icon={Cloud} title="FlareSolverr / Cloudflare Clearance" tone="amber">
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsCard>
    );
  }

  if (!config) return null;

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
  const hasCookie = Boolean(String(clearance.cf_clearance || "").trim() || String(clearance.cf_cookies || "").trim());
  const hasFlare = Boolean(String(clearance.flaresolverr_url || "").trim());

  const summaryItems = [
    { label: "总开关", value: clearance.enabled ? "已启用" : "关闭", ok: Boolean(clearance.enabled) },
    { label: "模式", value: modeLabel(mode), ok: mode !== "none" && Boolean(clearance.enabled) },
    {
      label: "FlareSolverr",
      value: hasFlare ? "已配置" : "未填 URL",
      ok: mode !== "flaresolverr" || hasFlare,
    },
    {
      label: "手动 Cookie",
      value: hasCookie ? "已填写" : mode === "manual" ? "待填写" : "—",
      ok: mode !== "manual" || hasCookie,
    },
  ];

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await save();
      const data = await testProxyClearance(testTarget.trim() || "https://chatgpt.com");
      setTestResult(data.result);
      if (data.result.ok) toast.success(`Clearance 成功（${data.result.latency_ms} ms）`);
      else toast.error(`Clearance 失败：${data.result.error ?? data.result.status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试 Clearance 失败");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <SettingsCard
      icon={Cloud}
      title="FlareSolverr / Cloudflare Clearance"
      tone="amber"
      meta={
        <Badge variant={clearance.enabled && mode !== "none" ? "success" : "secondary"}>
          {clearance.enabled ? modeLabel(mode) : "未启用"}
        </Badge>
      }
      action={
        <Button onClick={() => void save()} disabled={isSaving || isRegisterRunning}>
          {isSaving ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
          保存
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 shadow-sm"
            >
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
              <p className={`mt-1 truncate text-sm font-semibold ${item.ok ? "text-emerald-600" : "text-foreground"}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

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
          {isRegisterRunning
            ? "注册任务运行中已锁定本配置；请先停止注册再修改。"
            : "保存后，注册页「Cloudflare / FlareSolverr」只需勾选启用。生图上游清障请到同页「稳定代理 / WARP」。"}
        </SettingsNotice>
      </div>
    </SettingsCard>
  );
}
