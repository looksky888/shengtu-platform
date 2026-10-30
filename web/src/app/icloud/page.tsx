"use client";

import { AlertCircle, ArrowRight, LoaderCircle, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

import { MetricCard } from "./icloud-cards";
import { ICloudCreatePanels } from "./icloud-create-panels";
import { ICloudLoginPanels } from "./icloud-login-panels";
import { ICloudMailboxesPanel } from "./icloud-mailboxes-panel";
import { ICloudSessionsPanel } from "./icloud-sessions-panel";
import { useICloudPage } from "./use-icloud-page";

type ICloudTab = "mailboxes" | "sessions";

function parseICloudTab(raw: string | null): ICloudTab {
  return raw === "sessions" ? "sessions" : "mailboxes";
}

export default function ICloudPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/icloud");
  const controller = useICloudPage(Boolean(session));
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseICloudTab(searchParams.get("tab"));

  const handleTabChange = (nextTab: ICloudTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "mailboxes") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { loading, bridge, selectedAccountIds, pageError, notice, metrics, refreshAll, mailboxSummary, sessions } = controller;

  const isModuleDisabled =
    !loading &&
    (bridge?.enabled === false ||
      /未启用|disabled|feature_icloud/i.test(`${bridge?.error || ""} ${pageError}`));
  const hasBridgeWarning = !loading && !isModuleDisabled && (bridge?.reachable === false || Boolean(pageError));

  const tabs: readonly SubNavItem<ICloudTab>[] = [
    {
      value: "mailboxes",
      label: "隐私邮箱池与取码",
      icon: Mail,
      badge: mailboxSummary.total,
    },
    {
      value: "sessions",
      label: "Apple 账号与批量生成",
      icon: ShieldCheck,
      badge: sessions.length,
    },
  ];

  return (
    <section className="flex flex-col gap-5 pb-8">
      <PageHeader
        eyebrow="号池与运维"
        title="iCloud 隐私邮箱"
        badge={
          bridge?.reachable ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="success">Bridge 可达</Badge>
              {bridge.base_url ? (
                <span className="rounded-md border border-border/70 bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {bridge.base_url}
                </span>
              ) : null}
            </div>
          ) : undefined
        }
        description="集中管理隐藏邮件地址库存、IMAP 自动取码与多 Apple 会话批量生成。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {selectedAccountIds.length > 0 ? (
              <Badge variant="info">已选 {selectedAccountIds.length} 个账号 · 自动记住</Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loading}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        }
      />

      {isModuleDisabled ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-status-warning/30 bg-status-warning-soft/55 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-xs leading-5 text-foreground sm:items-center sm:text-[13px]">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-status-warning sm:mt-0" />
            <span>
              iCloud 隐私邮箱模块当前未启用 · 请前往「系统设置 → 邮箱与注册」开启后再执行取码与生成操作
            </span>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 bg-surface">
            <Link to="/settings?tab=email">
              前往开启
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : hasBridgeWarning ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-status-warning/30 bg-status-warning-soft/55 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-xs leading-5 text-foreground sm:items-center sm:text-[13px]">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-status-warning sm:mt-0" />
            <span>
              iCloud Bridge 服务暂未就绪
              {pageError && pageError !== "iCloud Bridge 未就绪" ? ` · ${pageError}` : " · 请确认本地 Sidecar 节点已启动后再重试"}
            </span>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 bg-surface" onClick={() => void refreshAll()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            重新检测
          </Button>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-[14px] border border-border/80 bg-surface-muted/70 px-4 py-3 text-xs text-foreground sm:text-[13px]">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          items={tabs}
          value={activeTab}
          onValueChange={handleTabChange}
          variant="pill"
          ariaLabel="iCloud 隐私邮箱栏目切换"
          layoutId="icloud-subnav"
        />
        <span className="text-xs text-muted-foreground">
          {activeTab === "mailboxes"
            ? "实时检索隐私邮箱库存、同步邮件并提取平台验证码"
            : "管理 Apple 会话、配置 IMAP 密码并执行批量或定时创建"}
        </span>
      </div>

      {activeTab === "mailboxes" ? (
        <ICloudMailboxesPanel controller={controller} onSwitchToSessions={() => handleTabChange("sessions")} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,.9fr)]">
          <ICloudSessionsPanel controller={controller} />
          <div className="space-y-5">
            <ICloudLoginPanels controller={controller} />
            <ICloudCreatePanels controller={controller} />
          </div>
        </div>
      )}
    </section>
  );
}
