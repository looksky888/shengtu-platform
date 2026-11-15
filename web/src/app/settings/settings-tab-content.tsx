"use client";

import { lazy, Suspense } from "react";
import { LoaderCircle } from "lucide-react";

import { CanvasLinkCard } from "./components/canvas-link-card";
import { ConfigCard } from "./components/config-card";
import { LoginVisualCard } from "./components/login-visual-card";
import type { SettingsTabKey } from "./settings-tab-types";

const LazyAdminChannelsPage = lazy(() => import("@/app/admin/channels/page"));
const LazyProxyTab = lazy(() => import("./tabs/proxy-tab"));
const LazyCPATab = lazy(() => import("./tabs/cpa-tab"));
const LazyEmailRiskTab = lazy(() => import("./tabs/email-risk-tab"));
const LazyAdminStorageSettingsPage = lazy(
  () => import("@/app/admin/settings/storage/page"),
);
const LazyAdminAnnouncementsPage = lazy(
  () => import("@/app/admin/announcements/page"),
);
const LazyBackupLogsTab = lazy(() => import("./tabs/backup-logs-tab"));
const LazySystemUpdateTab = lazy(() => import("./tabs/system-update-tab"));

function TabLoading() {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[22px] border border-border/70 bg-card/80 text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-5 animate-spin" />
      正在加载设置模块...
    </div>
  );
}

function ConfigTab({ canManageSystem }: { canManageSystem: boolean }) {
  return (
    <section className="flex flex-col gap-5">
      <ConfigCard />
      <div className="grid gap-5 lg:grid-cols-2">
        {canManageSystem ? <CanvasLinkCard /> : null}
        <div className={canManageSystem ? "" : "lg:col-span-2"}>
          <LoginVisualCard />
        </div>
      </div>
    </section>
  );
}

export function SettingsTabContent({
  activeTab,
  visitedTabs,
  canManageSystem,
}: {
  activeTab: SettingsTabKey;
  visitedTabs: readonly SettingsTabKey[];
  canManageSystem: boolean;
}) {
  const renderTabBody = (tab: SettingsTabKey) => {
    switch (tab) {
      case "config":
        return <ConfigTab canManageSystem={canManageSystem} />;
      case "channels":
        return <LazyAdminChannelsPage embedded />;
      case "proxy":
        return <LazyProxyTab />;
      case "cpa":
        return <LazyCPATab />;
      case "email":
        return <LazyEmailRiskTab />;
      case "media":
        return canManageSystem ? (
          <LazyAdminStorageSettingsPage embedded />
        ) : (
          <div className="rounded-[20px] border border-border/70 bg-card p-6 text-sm text-muted-foreground">
            只有管理员可以管理媒体存储、Cloudflare R2 与云存储 VIP 留存策略。
          </div>
        );
      case "announcements":
        return <LazyAdminAnnouncementsPage embedded />;
      case "backup":
        return <LazyBackupLogsTab />;
      case "system":
        return <LazySystemUpdateTab />;
    }
  };

  return (
    <>
      {visitedTabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <div
            key={tab}
            id={`settings-panel-${tab}`}
            role="tabpanel"
            hidden={!isActive}
            className={isActive ? "min-w-0" : "hidden"}
          >
            <Suspense fallback={<TabLoading />}>{renderTabBody(tab)}</Suspense>
          </div>
        );
      })}
    </>
  );
}
