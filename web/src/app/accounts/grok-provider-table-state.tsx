import { Inbox, LoaderCircle, RefreshCw, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GrokProviderTableSkeleton() {
  return <div className="grid gap-3 p-4" aria-label="账号列表加载中">{[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted/60" />)}</div>;
}

export function GrokProviderTableError({ message, loading, onRetry }: { message: string; loading: boolean; onRetry: () => void }) {
  return <div className="mx-4 my-6 grid place-items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-800"><div>{message}</div><Button variant="outline" className="rounded-full bg-white" disabled={loading} onClick={onRetry}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}重新加载</Button></div>;
}

export function GrokProviderTableEmpty({ filtered, canWrite, onImport }: { filtered: boolean; canWrite: boolean; onImport: () => void }) {
  return <div className="grid place-items-center gap-3 px-4 py-14 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-[#1456f0]">{filtered ? <Inbox className="size-5" /> : <UserPlus className="size-5" />}</span><div><div className="text-sm font-medium">{filtered ? "当前筛选下没有账号" : "还没有接入 Grok 账号"}</div><div className="mt-1 text-xs text-muted-foreground">{filtered ? "调整搜索词或筛选条件后重试" : "接入 Web、Build 或 Console 凭据后即可统一管理"}</div></div>{!filtered && canWrite ? <Button className="rounded-full" onClick={onImport}><UserPlus className="size-4" />账号接入</Button> : null}</div>;
}
