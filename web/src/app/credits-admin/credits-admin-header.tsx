import { Coins, CreditCard, KeyRound, Plus, ReceiptText, RefreshCw, SlidersHorizontal } from "lucide-react";

import { CreditSummaryCard } from "@/app/credits-admin/credit-summary-card";
import { formatCreditNumber } from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function CreditsAdminHeader({ state }: { state: CreditsAdminState }) {
  const totalGeneratedCards = Math.max(state.cardsTotal, state.activeCardCount + state.usedCardCount);

  return (
    <>
      <PageHeader
        eyebrow="商业化与算力核算"
        title="积分与卡密管理"
        badge={
          !state.isLoading ? (
            <Badge variant="secondary" className="rounded-md tabular-nums">
              {state.accountCount} 个积分账户
            </Badge>
          ) : null
        }
        description="统一管理积分兑换卡密生成、核销状态追踪、全平台积分收支流水与人工调账。"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void state.loadData()} disabled={state.isLoading}>
              <RefreshCw className={`size-4 ${state.isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            {state.permissions.canManageCredits ? (
              <>
                <Button variant="outline" size="sm" onClick={state.openManualAdjustCreditsDialog}>
                  <SlidersHorizontal className="size-4" />
                  调整用户积分
                </Button>
                <Button size="sm" onClick={() => state.setIsGenerateDialogOpen(true)}>
                  <Plus className="size-4" />
                  生成卡密
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <CreditSummaryCard
          icon={KeyRound}
          label="当前卡密总数"
          value={`${formatCreditNumber(totalGeneratedCards)} 张`}
          badge={`${state.activeCardCount} 可用`}
          hint="按当前筛选口径统计的积分兑换卡密总量"
        />
        <CreditSummaryCard
          icon={CreditCard}
          label="待核销 / 已使用"
          value={`${state.activeCardCount} / ${state.usedCardCount}`}
          badge={
            totalGeneratedCards > 0
              ? `核销率 ${Math.round((state.usedCardCount / totalGeneratedCards) * 100)}%`
              : "0%"
          }
          hint="有效待兑换卡密与已完成核销卡密对比"
        />
        <CreditSummaryCard
          icon={ReceiptText}
          label="近期流水笔数"
          value={`${formatCreditNumber(state.ledgerTotal)} 笔`}
          badge="实时记账"
          hint="涵盖签到、卡密核销、创作扣费与后台调账"
        />
        <CreditSummaryCard
          icon={Coins}
          label="平台积分池总余额"
          value={`${formatCreditNumber(state.totalBalance)} 积分`}
          badge={`${state.accountCount} 户`}
          hint="全部用户账户当前可用算力积分汇总"
        />
      </div>
    </>
  );
}