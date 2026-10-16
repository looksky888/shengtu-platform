"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { RegisterCardLoading } from "./register-card-loading";
import { RegisterConfigPanel } from "./register-config-panel";
import { RegisterResultsPanel } from "./register-results-panel";
import { useRegisterCard } from "./use-register-card";

export function RegisterCard() {
  const state = useRegisterCard();

  if (state.isLoading) return <RegisterCardLoading />;
  if (!state.config) return null;

  const target = state.config.target === "grok" ? "grok" : "openai";
  const targetLabel = target === "grok" ? "Grok / xAI" : "ChatGPT / OpenAI";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "openai" as const, label: "ChatGPT 注册" },
            { id: "grok" as const, label: "Grok 注册" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={state.config!.enabled}
            onClick={() => {
              if (state.config!.enabled) return;
              state.setTarget(tab.id);
            }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              target === tab.id
                ? "bg-[#1456f0] text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              state.config!.enabled && "cursor-not-allowed opacity-60",
            )}
          >
            {tab.label}
          </button>
        ))}
        <Badge variant={state.config.enabled ? "default" : "secondary"} className="ml-auto rounded-full">
          {state.config.enabled ? "运行中" : "未启动"} · {targetLabel}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">注册账号</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {target === "grok"
              ? "Grok：需 REGISTER_BACKEND=python；配置下方打码后启动。成功写入 Grok 号池。"
              : "ChatGPT：邮箱来源 claim 隐私邮箱后注册，成功写入主站号池。"}
          </p>
        </div>
        {state.isSaving ? (
          <Badge variant="secondary" className="rounded-full">
            保存中…
          </Badge>
        ) : null}
      </div>

      <div className="grid min-h-[640px] items-stretch gap-0 overflow-hidden rounded-[24px] border border-[#f2f3f5] bg-card shadow-[0_0_15px_rgba(44,30,116,0.12)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <RegisterConfigPanel state={state} />
        <RegisterResultsPanel state={state} />
      </div>
    </div>
  );
}
