"use client";

import { memo, Suspense, type ReactNode } from "react";
import { FileClock, ListChecks, LoaderCircle, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { CanvasLinkCard } from "./components/canvas-link-card";
import { EmailRegistrationTab } from "./email-registration-tab";
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
  LoginVisualCard,
  MediaStorageCard,
  RegisterClearanceCard,
  SystemUpdateCard,
  UpstreamProxyRuntimeCard,
} from "./settings-tab-lazy";
import type { SettingsTabKey } from "./settings-tab-types";

function TabLoading() {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[14px] border border-border/80 bg-surface text-sm text-muted-foreground shadow-2xs">
      <LoaderCircle className="mr-2 size-5 animate-spin" />
      正在加载设置模块…
    </div>
  );
}

function AdminPermissionNotice({ message }: { message: string }) {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="需要管理员权限"
      description={message}
      className="rounded-[14px] border border-border/80 bg-surface py-12 shadow-2xs"
    />
  );
}

function MasonryItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-w-0 ${className ?? ""}`}>{children}</div>;
}

function BaseTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可修改平台基础并发、默认限流与品牌画廊配置。" />
    );
  }
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem className="md:col-span-2">
        <ConfigCard />
      </MasonryItem>
      <MasonryItem className="md:col-span-2">
        <CanvasLinkCard />
      </MasonryItem>
      <MasonryItem className="md:col-span-2">
        <LoginVisualCard />
      </MasonryItem>
    </section>
  );
}

function RegisterTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可配置上游代理与 Cloudflare 清障服务。" />
    );
  }
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <div className="rounded-[14px] border border-border/80 bg-surface px-4 py-3 text-xs leading-5 text-muted-foreground shadow-2xs md:col-span-2">
        <strong className="font-semibold text-foreground">
          作用域说明：
        </strong>
        左栏控制<strong className="font-medium text-foreground">生图与视频上游号池</strong>的出站代理及
        WARP 清障；右栏独立控制<strong className="font-medium text-foreground">自动化注册机</strong>的代理与
        Cloudflare Clearance 预热，两者互不覆盖。
      </div>
      <MasonryItem>
        <UpstreamProxyRuntimeCard />
      </MasonryItem>
      <MasonryItem>
        <RegisterClearanceCard />
      </MasonryItem>
    </section>
  );
}

function ImageTab({
  active,
  canManageSystem,
}: {
  active: boolean;
  canManageSystem: boolean;
}) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可配置生图渠道、模型路由与计费策略。" />
    );
  }
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem className="md:col-span-2">
        <ImageProviderCard />
      </MasonryItem>
      <MasonryItem className="md:col-span-2">
        <ImageAccountPoolRoutingCard />
      </MasonryItem>
      <MasonryItem className="md:col-span-2">
        <ImageTaskStatsCard active={active} />
      </MasonryItem>
    </section>
  );
}

function StorageTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可配置媒体存储后端与历史图片平滑迁移。" />
    );
  }
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem className="md:col-span-2">
        <MediaStorageCard />
      </MasonryItem>
    </section>
  );
}

function ImportsTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可管理远程 CPA 号池连接与批量账号导入。" />
    );
  }
  return (
    <>
      <section className="grid gap-5 md:grid-cols-2">
        <MasonryItem className="md:col-span-2">
          <CPAPoolsCard />
        </MasonryItem>
      </section>
      <CPAPoolDialog />
      <ImportBrowserDialog />
    </>
  );
}

function AnnouncementTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可发布、停用或删除站内弹窗公告。" />
    );
  }
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem className="md:col-span-2">
        <AnnouncementsCard />
      </MasonryItem>
    </section>
  );
}

function BackupTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可配置定时备份策略与 R2 异地容灾快照。" />
    );
  }
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem className="md:col-span-2">
        <BackupSettingsCard />
      </MasonryItem>
    </section>
  );
}

function MaintenanceTab({ canManageSystem }: { canManageSystem: boolean }) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <div className="rounded-[14px] border border-border/80 bg-surface p-4 shadow-2xs md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground sm:text-[15px]">
              日志与任务治理快捷入口
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              快速跳转至审计日志检索台或历史创作任务队列
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/logs">
                <FileClock className="size-3.5" />
                系统日志
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/task-queue?tab=history">
                <ListChecks className="size-3.5" />
                任务历史
              </Link>
            </Button>
          </div>
        </div>
      </div>
      {canManageSystem ? (
        <MasonryItem className="md:col-span-2">
          <LogGovernanceCard />
        </MasonryItem>
      ) : (
        <MasonryItem className="md:col-span-2">
          <AdminPermissionNotice message="仅系统管理员可调整日志保留期与执行过期日志清理。" />
        </MasonryItem>
      )}
    </section>
  );
}

function SystemUpdateTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <AdminPermissionNotice message="仅系统管理员可查看版本预检状态并触发宿主机平滑升级。" />
    );
  }
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <MasonryItem className="md:col-span-2">
        <SystemUpdateCard />
      </MasonryItem>
    </section>
  );
}

export const SettingsTabContent = memo(function SettingsTabContent({
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
      content = <RegisterTab canManageSystem={canManageSystem} />;
      break;
    case "email":
      content = <EmailRegistrationTab canManageSystem={canManageSystem} />;
      break;
    case "image":
      content = <ImageTab active={active} canManageSystem={canManageSystem} />;
      break;
    case "storage":
      content = <StorageTab canManageSystem={canManageSystem} />;
      break;
    case "imports":
      content = <ImportsTab canManageSystem={canManageSystem} />;
      break;
    case "announcement":
      content = <AnnouncementTab canManageSystem={canManageSystem} />;
      break;
    case "backup":
      content = <BackupTab canManageSystem={canManageSystem} />;
      break;
    case "maintenance":
      content = <MaintenanceTab canManageSystem={canManageSystem} />;
      break;
    case "system-update":
      content = <SystemUpdateTab canManageSystem={canManageSystem} />;
      break;
  }
  return (
    <SectionErrorBoundary resetKey={tab} title="设置分组模块加载失败">
      <Suspense fallback={<TabLoading />}>{content}</Suspense>
    </SectionErrorBoundary>
  );
});
