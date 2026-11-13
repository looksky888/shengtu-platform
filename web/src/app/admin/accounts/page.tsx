"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { AccountsPageContent } from "@/app/accounts/accounts-content";
import { ICloudContent } from "@/app/icloud/page";
import { CPAPoolDialog } from "@/app/settings/components/cpa-pool-dialog";
import { CPAPoolsCard } from "@/app/settings/components/cpa-pools-card";
import { ImportBrowserDialog } from "@/app/settings/components/import-browser-dialog";
import { useSettingsStore } from "@/app/settings/store";
import { AdminPageFrame, AdminUnderlineTabs } from "@/components/admin";
import { useAuthGuard } from "@/lib/use-auth-guard";

type AccountsHubTab = "pool" | "icloud" | "cpa";

const ACCOUNTS_TABS = [
  { value: "pool" as const, label: "GPT / Grok 账号列表" },
  { value: "icloud" as const, label: "iCloud 隐私邮箱池" },
  { value: "cpa" as const, label: "CPA 远程导入" },
] as const;

export default function AdminAccountsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/accounts");
  const [activeTab, setActiveTab] = useState<AccountsHubTab>("pool");
  const loadPools = useSettingsStore((state) => state.loadPools);
  const poolsCount = useSettingsStore((state) => state.pools.length);

  useEffect(() => {
    if (session && activeTab === "cpa") {
      void loadPools();
    }
  }, [activeTab, loadPools, session]);

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  return (
    <AdminPageFrame
      groupLabel="算力与号池"
      title="账号池中心"
      description="集中调度 ChatGPT / Grok 生产账号库存、iCloud 隐私邮箱取码与 CLIProxyAPI 远程批量同步。"
    >
      <AdminUnderlineTabs
        items={ACCOUNTS_TABS.map((item) =>
          item.value === "cpa" && poolsCount > 0
            ? { ...item, badge: poolsCount }
            : item,
        )}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="pool"
      />

      {activeTab === "pool" ? (
        <AccountsPageContent session={session} embedded />
      ) : activeTab === "icloud" ? (
        <ICloudContent embedded />
      ) : (
        <div className="space-y-4">
          <CPAPoolsCard />
          <CPAPoolDialog />
          <ImportBrowserDialog />
        </div>
      )}
    </AdminPageFrame>
  );
}
