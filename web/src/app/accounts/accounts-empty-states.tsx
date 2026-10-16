import { LoaderCircle, Search, UserRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function AccountsLoadingCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="rounded-xl bg-muted p-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /></div>
        <p className="text-sm font-medium text-foreground">正在加载账户</p>
      </CardContent>
    </Card>
  );
}

export function AccountsInitialEmptyState() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-[16px] bg-[#edf4ff] p-4 text-[#1456f0] ring-1 ring-blue-100"><UserRound className="size-7" /></div>
      <div className="space-y-1"><p className="text-sm font-medium text-foreground">暂无账号</p><p className="max-w-[28rem] text-sm leading-6 text-muted-foreground">导入 Token 后，账号状态、类型、额度和调用统计会在这里显示。</p></div>
    </div>
  );
}

export function AccountsFilteredEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-xl bg-muted p-3 text-muted-foreground"><Search className="size-5" /></div>
      <div className="space-y-1"><p className="text-sm font-medium text-foreground">没有匹配的账户</p><p className="text-sm text-muted-foreground">调整筛选条件或搜索关键字后重试。</p></div>
    </div>
  );
}
