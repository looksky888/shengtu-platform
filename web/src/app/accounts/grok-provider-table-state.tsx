import { AlertCircle, ChevronRight, Inbox, LoaderCircle, RefreshCw, Unplug, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

function isGrokRuntimeUnreachableError(message: string): boolean {
  return /grok-runtime|dial tcp|lookup\s+|no such host|connection refused|connectex|upstream|bad gateway|service unavailable|ECONNREFUSED|502|503|504/i.test(
    message,
  );
}

export function GrokProviderTableSkeleton() {
  return (
    <div className="grid gap-3 p-4" aria-label="账号列表加载中">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-xl bg-surface-muted/70" />
      ))}
    </div>
  );
}

export function GrokProviderDiagnosticCallout({
  message,
  loading,
  onRetry,
  onDismiss,
}: {
  message: string;
  loading?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const unreachable = isGrokRuntimeUnreachableError(message);

  if (unreachable) {
    return (
      <div className="mx-4 my-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.045] p-5 dark:border-amber-400/20 dark:bg-amber-500/[0.06]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <Unplug className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Grok 运行时服务暂未连接
              </h3>
              <p className="text-xs leading-5 text-muted-foreground">
                未检测到本地 <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">grok-runtime</code> 节点响应，请确认容器已启动后再刷新。
              </p>
              <details className="group pt-1.5">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" />
                  <span>查看底层网络诊断信息</span>
                </summary>
                <pre className="mt-2 max-w-full overflow-x-auto rounded-lg border border-border/80 bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                  {message}
                </pre>
              </details>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:pl-2">
            {onRetry ? (
              <Button variant="outline" size="sm" className="bg-surface" disabled={loading} onClick={onRetry}>
                {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                重新检测
              </Button>
            ) : null}
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                aria-label="关闭诊断提示"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 my-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-danger/25 bg-status-danger-soft/60 px-4 py-3 text-xs text-status-danger">
      <div className="flex min-w-0 items-center gap-2.5">
        <AlertCircle className="size-4 shrink-0" />
        <span className="break-words">{message}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onRetry ? (
          <Button variant="outline" size="xs" className="bg-surface text-foreground" disabled={loading} onClick={onRetry}>
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            重新检测
          </Button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex size-6 items-center justify-center rounded-md hover:bg-status-danger/10"
            aria-label="关闭错误提示"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
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
  return <GrokProviderDiagnosticCallout message={message} loading={loading} onRetry={onRetry} />;
}

export function GrokProviderTableEmpty({
  filtered,
  canWrite,
  onImport,
  onResetFilters,
}: {
  filtered: boolean;
  canWrite: boolean;
  onImport: () => void;
  onResetFilters?: () => void;
}) {
  return (
    <EmptyState
      icon={filtered ? Inbox : UserPlus}
      title={filtered ? "当前筛选下没有匹配的 Grok 账号" : "还没有接入 Grok 账号"}
      description={
        filtered
          ? "调整搜索词或切换 Provider 与状态筛选后重试。"
          : "接入 Web、Build 或 Console 凭据后即可统一管理并发、出口与配额。"
      }
      action={
        filtered ? (
          onResetFilters ? (
            <Button variant="outline" size="sm" onClick={onResetFilters}>
              重置筛选条件
            </Button>
          ) : undefined
        ) : canWrite ? (
          <Button size="sm" onClick={onImport}>
            <UserPlus className="size-3.5" />
            账号接入
          </Button>
        ) : undefined
      }
      className="py-14"
    />
  );
}
