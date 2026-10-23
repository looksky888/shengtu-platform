import { LoaderCircle, Search, UserRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function AccountsLoadingCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="rounded-xl border border-border/80 bg-surface-muted/70 p-3 text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
        <p className="text-sm font-medium text-foreground">正在加载账户</p>
      </CardContent>
    </Card>
  );
}

export function AccountsInitialEmptyState() {
  return (
    <EmptyState
      icon={UserRound}
      title="暂无账号"
      description="导入 Token 后，账号状态、类型、额度和调用统计会在这里显示。"
      className="min-h-[260px] py-16"
    />
  );
}

export function AccountsFilteredEmptyState() {
  return (
    <EmptyState
      compact
      icon={Search}
      title="没有匹配的账户"
      description="调整筛选条件或搜索关键字后重试。"
      className="border-0 bg-transparent py-10"
    />
  );
}
