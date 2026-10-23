import { Inbox, LoaderCircle, RefreshCw, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function GrokProviderTableSkeleton() {
  return (
    <div className="grid gap-3 p-4" aria-label="账号列表加载中">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-20 animate-pulse rounded-xl bg-muted/60" />
      ))}
    </div>
  );
}

export function GrokProviderTableError({
  message,
  loading,
  onRetry,
}: {
  message: string;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mx-4 my-6 grid place-items-center gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-8 text-center text-sm text-rose-700 dark:text-rose-300">
      <div>{message}</div>
      <Button
        variant="outline"
        className="h-9 rounded-lg bg-surface"
        disabled={loading}
        onClick={onRetry}
      >
        {loading ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        重新加载
      </Button>
    </div>
  );
}

export function GrokProviderTableEmpty({
  filtered,
  canWrite,
  onImport,
}: {
  filtered: boolean;
  canWrite: boolean;
  onImport: () => void;
}) {
  return (
    <EmptyState
      icon={filtered ? Inbox : UserPlus}
      title={filtered ? "当前筛选下没有账号" : "还没有接入 Grok 账号"}
      description={
        filtered
          ? "调整搜索词或筛选条件后重试。"
          : "接入 Web、Build 或 Console 凭据后即可统一管理。"
      }
      action={
        !filtered && canWrite ? (
          <Button className="h-9 rounded-lg" onClick={onImport}>
            <UserPlus className="size-4" />
            账号接入
          </Button>
        ) : undefined
      }
      className="py-14"
    />
  );
}
