import type { ReactNode } from "react";
import { LoaderCircle, RotateCcw, Search, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function AccountsLoadingCard() {
  return (
    <Card className="rounded-[14px] border border-border/80 bg-surface shadow-2xs">
      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="rounded-xl border border-border/80 bg-surface-muted/70 p-3 text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
        <p className="text-sm font-medium text-foreground">正在加载账户</p>
      </CardContent>
    </Card>
  );
}

export function AccountsInitialEmptyState({ action }: { action?: ReactNode }) {
  return (
    <EmptyState
      icon={UserRound}
      title="号池暂无接入账号"
      description="导入账号 Token、Session JSON 或 CPA 文件后，系统将自动探测套餐类型、剩余额度与调度状态。"
      action={action}
      className="min-h-[260px] py-16"
    />
  );
}

export function AccountsFilteredEmptyState({ onResetFilters }: { onResetFilters?: () => void }) {
  return (
    <EmptyState
      compact
      icon={Search}
      title="没有匹配的账户"
      description="调整搜索词或切换账户类型、状态筛选后重试。"
      action={
        onResetFilters ? (
          <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>
            <RotateCcw className="size-3.5" />
            重置筛选条件
          </Button>
        ) : undefined
      }
      className="border-0 bg-transparent py-12"
    />
  );
}
