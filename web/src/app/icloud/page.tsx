"use client";

import { useState } from "react";
import { LoaderCircle, Mail, RefreshCw, ShieldCheck } from "lucide-react";

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

export default function ICloudPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/icloud");
  const controller = useICloudPage(Boolean(session));
  const [activeTab, setActiveTab] = useState<ICloudTab>("mailboxes");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { loading, bridge, selectedAccountIds, pageError, notice, metrics, refreshAll, mailboxSummary, sessions } = controller;

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
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-8">
      <PageHeader
        eyebrow="邮箱"
        title="iCloud 隐私邮箱"
        actions={
          <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        }
      />
      <p className="-mt-2 text-sm leading-6 text-muted-foreground">
        先登录 Apple（新/旧接口）并配置 IMAP 取码，再创建隐私邮箱；注册机{" "}
        <code className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">icloud_local</code> 才能 claim。
        密码仅用于当前请求，不会写入前端本地存储。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={bridge?.reachable ? "success" : "danger"}>
          {bridge?.reachable ? "Bridge 可达" : "Bridge 未就绪"}
        </Badge>
        {bridge?.base_url ? (
          <span className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {bridge.base_url}
          </span>
        ) : null}
        {selectedAccountIds.length > 0 ? <Badge variant="info">已选 {selectedAccountIds.length} 个账号 · 自动记住</Badge> : null}
      </div>

      {pageError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {pageError}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
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
          onValueChange={setActiveTab}
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
        <ICloudMailboxesPanel controller={controller} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,.9fr)]">
          <ICloudSessionsPanel controller={controller} />
          <div className="space-y-5">
            <ICloudLoginPanels controller={controller} />
            <ICloudCreatePanels controller={controller} />
          </div>
        </div>
      )}
    </div>
  );
}
