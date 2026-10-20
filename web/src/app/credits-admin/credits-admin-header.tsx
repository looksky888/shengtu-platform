import { Plus, RefreshCw } from "lucide-react";

import { CreditSummaryCard } from "@/app/credits-admin/credit-summary-card";
import { formatCreditNumber } from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export function CreditsAdminHeader({ state }: { state: CreditsAdminState }) {
  return (
    <>
      <PageHeader
        eyebrow="积分"
        title="积分管理"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void state.loadData()} disabled={state.isLoading}>
              <RefreshCw className={`size-4 ${state.isLoading ? "animate-spin" : ""}`} />刷新
            </Button>
            {state.permissions.canManageCredits ? (
              <Button size="sm" onClick={() => state.setIsGenerateDialogOpen(true)}>
                <Plus className="size-4" />生成卡密
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CreditSummaryCard label="总余额" value={`${formatCreditNumber(state.totalBalance)} 积分`} hint="全部用户当前积分汇总" />
        <CreditSummaryCard label="有效卡密" value={`${state.activeCardCount}`} hint="仍可兑换的积分卡数量" />
        <CreditSummaryCard label="已兑换卡密" value={`${state.usedCardCount}`} hint="已经完成使用的卡密数量" />
        <CreditSummaryCard label="账户数" value={`${state.accountCount}`} hint="已建立积分账户的用户数" />
      </div>
    </>
  );
}