"use client";

import { Suspense, type ReactNode } from "react";
import { FileClock, ListChecks, LoaderCircle } from "lucide-react";

import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import {
  AnnouncementsCard,
  BackupSettingsCard,
  ConfigCard,
  CPAPoolDialog,
  CPAPoolsCard,
  ImageAccountPoolRoutingCard,
  ImageProviderCard,
  ImageTaskStatsCard,
  ImportBrowserDialog,
  LogGovernanceCard,
  MediaStorageCard,
  RegisterClearanceCard,
  UpstreamProxyRuntimeCard,
} from "./settings-tab-lazy";
import { EmailRegistrationTab } from "./email-registration-tab";
import type { SettingsTabKey } from "./settings-tab-types";
import { CanvasLinkCard } from "./components/canvas-link-card";

function TabLoading() {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[22px] border border-border/70 bg-card/80 text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-5 animate-spin" />
      正在加载设置模块...
    </div>
  );
}

function MasonryItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className ?? ""}`}>{children}</div>;
}

function BaseTab({ canManageSystem }: { canManageSystem: boolean }) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem className="md:col-span-2">
        <ConfigCard />
      </MasonryItem>
      {canManageSystem && <MasonryItem className="md:col-span-2"><CanvasLinkCard /></MasonryItem>}
    </section>
  );
}

function RegisterTab() {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem>
        <UpstreamProxyRuntimeCard />
      </MasonryItem>
      <MasonryItem>
        <RegisterClearanceCard />
      </MasonryItem>
    </section>
  );
}

function ImageTab({ active }: { active: boolean }) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <ImageProviderCard />
      <ImageAccountPoolRoutingCard />
      <ImageTaskStatsCard active={active} />
    </section>
  );
}

function StorageTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return <div className="rounded-[20px] border border-border/70 bg-card p-6 text-sm text-muted-foreground">只有管理员可以管理媒体存储和旧图片迁移。</div>;
  }
  return <section className="grid gap-5 md:grid-cols-2"><MediaStorageCard /></section>;
}

function ImportsTab() {
  return (
    <>
      <section className="grid gap-5 md:grid-cols-2">
        <MasonryItem>
          <CPAPoolsCard />
        </MasonryItem>
      </section>
      <CPAPoolDialog />
      <ImportBrowserDialog />
    </>
  );
}

function AnnouncementTab() {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem>
        <AnnouncementsCard />
      </MasonryItem>
    </section>
  );
}

function BackupTab() {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <BackupSettingsCard />
    </section>
  );
}

function MaintenanceTab({ canManageSystem }: { canManageSystem: boolean }) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <div className="rounded-[22px] border border-border/70 bg-gradient-to-br from-card to-muted/30 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground">
              日志与任务入口
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/logs">
                <FileClock className="size-4" />
                日志管理
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/task-queue?tab=history">
                <ListChecks className="size-4" />
                任务历史
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <LogGovernanceCard />
    </section>
  );
}

export function SettingsTabContent({
  active,
  canManageSystem,
  tab,
}: {
  active: boolean;
  canManageSystem: boolean;
  tab: SettingsTabKey;
}) {
  let content: ReactNode;
  switch (tab) {
    case "base":
      content = <BaseTab canManageSystem={canManageSystem} />;
      break;
    case "register":
      content = <RegisterTab />;
      break;
    case "email":
      content = <EmailRegistrationTab canManageSystem={canManageSystem} />;
      break;
    case "image":
      content = <ImageTab active={active} />;
      break;
    case "storage":
      content = <StorageTab canManageSystem={canManageSystem} />;
      break;
    case "imports":
      content = <ImportsTab />;
      break;
    case "announcement":
      content = <AnnouncementTab />;
      break;
    case "backup":
      content = <BackupTab />;
      break;
    case "maintenance":
      content = <MaintenanceTab canManageSystem={canManageSystem} />;
      break;
  }
  return <Suspense fallback={<TabLoading />}>{content}</Suspense>;
}
