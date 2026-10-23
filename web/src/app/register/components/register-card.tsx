"use client";

import { LoaderCircle, Play, RotateCcw, Save, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";

import { RegisterCardLoading } from "./register-card-loading";
import { RegisterConfigPanel } from "./register-config-panel";
import { RegisterResultsPanel } from "./register-results-panel";
import { useRegisterCard } from "./use-register-card";

type RegisterTarget = "openai" | "grok";

export function RegisterCard() {
  const state = useRegisterCard();

  if (state.isLoading) return <RegisterCardLoading />;
  if (!state.config) return null;

  const target: RegisterTarget = state.config.target === "grok" ? "grok" : "openai";
  const targetLabel = target === "grok" ? "Grok / xAI" : "ChatGPT / OpenAI";

  const targetItems: readonly SubNavItem<RegisterTarget>[] = [
    {
      value: "openai",
      label: "ChatGPT 注册",
      disabled: state.config.enabled,
    },
    {
      value: "grok",
      label: "Grok 注册",
      disabled: state.config.enabled,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <SubNav
            items={targetItems}
            value={target}
            onValueChange={(nextTarget) => {
              if (!state.config?.enabled) {
                state.setTarget(nextTarget);
              }
            }}
            variant="pill"
            ariaLabel="注册目标平台切换"
            layoutId="register-target-subnav"
          />
          <Badge variant={state.config.enabled ? "success" : "secondary"}>
            {state.config.enabled ? "运行中" : "未启动"} · {targetLabel}
          </Badge>
          <span className="hidden text-xs text-muted-foreground lg:inline">
            {target === "grok"
              ? "连接打码服务并取码注册，成功后自动入驻 Grok 号池"
              : "自动领用邮箱取码注册，成功后自动入驻主站号池"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void state.reset()}
            disabled={state.isSaving || state.config.enabled}
          >
            <RotateCcw className="size-3.5" />
            重置统计
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void state.save()}
            disabled={state.isSaving || state.config.enabled}
          >
            {state.isSaving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            保存配置
          </Button>
          <Button
            variant={state.config.enabled ? "destructive" : "brand"}
            size="sm"
            onClick={() => void state.toggle()}
            disabled={state.isSaving}
          >
            {state.isSaving ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : state.config.enabled ? (
              <Square className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {state.config.enabled ? "停止任务" : "启动任务"}
          </Button>
        </div>
      </div>

      <div className="grid min-h-[640px] items-stretch gap-0 overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <RegisterConfigPanel state={state} />
        <RegisterResultsPanel state={state} />
      </div>
    </div>
  );
}
