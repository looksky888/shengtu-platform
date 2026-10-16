import { AlertCircle, CheckCircle2, Link2, LoaderCircle, RefreshCw, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createGrokProviderConversionTask,
  getGrokProviderConversionTask,
  listActiveGrokProviderConversionTasks,
  listGrokProviderAccounts,
  type GrokProviderConversionTask,
  type GrokProvider,
  type GrokProviderAccountsResponse,
} from "@/lib/grok-provider-accounts-api";
import { cn } from "@/lib/utils";

const PROVIDERS: Array<{ id: GrokProvider; label: string; caption: string }> = [
  { id: "build", label: "Grok Build", caption: "OAuth / Build API" },
  { id: "web", label: "Grok Web", caption: "SSO / Web API" },
  { id: "console", label: "Grok Console", caption: "Console API / DPoP" },
];

const STATUS_LABELS = { active: "可用", disabled: "已停用", error: "异常", unknown: "待检测" } as const;

function statusTone(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "disabled") return "border-border bg-muted text-muted-foreground";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function GrokProviderOverview() {
  const [provider, setProvider] = useState<GrokProvider | "all">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<GrokProviderAccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [task, setTask] = useState<GrokProviderConversionTask | null>(null);
  const taskId = task?.id;
  const taskActive = task?.status === "queued" || task?.status === "running";

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      setData(await listGrokProviderAccounts({ page, page_size: 20, provider }, signal));
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "统一账号视图加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, provider]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void listActiveGrokProviderConversionTasks(controller.signal)
      .then((response) => setTask(response.items.find((item) => item.operation === "convert") || null))
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "转换任务状态读取失败");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!taskId || !taskActive) return;
    const controller = new AbortController();
    let timer = 0;
    const poll = async () => {
      try {
        const { task: next } = await getGrokProviderConversionTask(taskId, controller.signal);
        setTask(next);
        if (next.status === "succeeded") await load();
        if (["queued", "running"].includes(next.status)) timer = window.setTimeout(poll, 1500);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "转换任务状态读取失败");
          timer = window.setTimeout(poll, 3000);
        }
      }
    };
    timer = window.setTimeout(poll, 1500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [load, taskActive, taskId]);

  const startConversion = async (target: "build" | "console") => {
    setError("");
    setSubmitting(true);
    try {
      const response = await createGrokProviderConversionTask(target, "missing");
      setTask(response.task);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "转换任务启动失败");
    } finally {
      setSubmitting(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil((data?.total || 0) / (data?.page_size || 20)));
  return (
    <section className="overflow-hidden rounded-3xl border border-[#1456f0]/15 bg-white shadow-[0_12px_32px_-20px_rgba(44,30,116,0.35)] dark:bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Grok 上游账号中心</h2>
            <Badge className="rounded-full bg-[#1456f0]/10 text-[#1456f0] hover:bg-[#1456f0]/10">Provider 迁移</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">查看账号状态并完成 Console 或 Build 转换。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" disabled={loading || submitting || taskActive} onClick={() => void startConversion("console")}><WandSparkles className="size-4" />补齐 Console</Button>
          <Button variant="outline" className="rounded-full" disabled={loading || submitting || taskActive} onClick={() => void startConversion("build")}><WandSparkles className="size-4" />补齐 Build</Button>
          <Button variant="outline" className="rounded-full" disabled={loading} onClick={() => void load()}><RefreshCw className={cn("size-4", loading && "animate-spin")} />刷新投影</Button>
        </div>
      </header>

      {task ? <div className={cn("mx-5 mt-5 rounded-2xl border px-4 py-3", task.status === "failed" ? "border-rose-200 bg-rose-50" : "border-blue-200 bg-blue-50/70 dark:bg-blue-950/20")}>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{task.target === "console" ? "Console" : "Build"} 转换 · {task.status === "succeeded" ? "已完成" : task.status === "failed" ? "失败" : "进行中"}</span><span className="tabular-nums text-muted-foreground">{task.progress.completed}/{task.progress.total || "—"}</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-[#1456f0] transition-[width]" style={{ width: `${task.progress.percent}%` }} /></div>
        {task.error ? <div className="mt-2 text-xs text-rose-700">{task.error.code}</div> : null}
        {task.status === "succeeded" ? <div className="mt-2 text-xs text-muted-foreground">新增 {task.result.created || 0}，更新 {task.result.updated || 0}，跳过 {task.result.skipped || 0}，失败 {task.result.failures?.length || 0}</div> : null}
      </div> : null}

      <div className="grid gap-3 p-5 md:grid-cols-3">
        {PROVIDERS.map((item) => {
          const selected = provider === item.id;
          return (
            <button key={item.id} type="button" onClick={() => { setProvider(selected ? "all" : item.id); setPage(1); }} className={cn("rounded-2xl border p-4 text-left transition", selected ? "border-[#1456f0] bg-[#1456f0]/5 shadow-sm" : "border-border hover:border-[#1456f0]/35")}>
              <div className="flex items-center justify-between gap-3">
                <div><div className="font-medium">{item.label}</div><div className="mt-1 text-xs text-muted-foreground">{item.caption}</div></div>
                <div className="text-3xl font-semibold tabular-nums text-[#17437d] dark:text-blue-300">{data?.summary.by_provider[item.id] ?? "—"}</div>
              </div>
            </button>
          );
        })}
      </div>

      {data ? (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">{data.projection.status === "success" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <AlertCircle className="size-3.5 text-rose-600" />}投影 {data.projection.status === "success" ? "正常" : "失败"}</span>
          <span>凭据可用 {data.summary.with_credentials}</span><span>已关联 {data.summary.linked}</span>
          <span>Web 对齐 {data.projection.consistency.web_archive_runtime_matched ?? 0}</span>
          <span>Build 未关联 {data.projection.consistency.build_unlinked ?? 0}</span>
          <span>Console {data.projection.sources.console === "not_configured" ? "待接入" : data.projection.sources.console}</span>
        </div>
      ) : null}

      {error ? <div className="mx-5 mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      <div className="mx-5 mb-5 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">账号</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">凭据</th><th className="px-4 py-3">能力</th><th className="px-4 py-3">关联</th></tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={6} className="py-10 text-center text-muted-foreground"><LoaderCircle className="mx-auto size-5 animate-spin" /></td></tr> : null}
            {!loading && !error && data?.items.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">当前 Provider 暂无账号</td></tr> : null}
            {data?.items.map((account) => <tr key={account.id} className="border-t border-border/70"><td className="px-4 py-3 font-medium capitalize">{account.provider}</td><td className="px-4 py-3"><div className="font-medium">{account.display_name}</div><div className="font-mono text-[11px] text-muted-foreground">{account.id}</div></td><td className="px-4 py-3"><span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs", statusTone(account.status))}>{STATUS_LABELS[account.status]}</span></td><td className="px-4 py-3 text-xs">{account.has_credential ? account.credential_kind.toUpperCase() : "缺失"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{account.capabilities.length ? account.capabilities.map((capability) => <Badge key={capability} variant="secondary" className="rounded-full font-normal">{capability}</Badge>) : <span className="text-xs text-muted-foreground">待检测</span>}</div></td><td className="px-4 py-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Link2 className="size-3.5" />{account.links.length}</span></td></tr>)}
          </tbody>
        </table>
        {data && pageCount > 1 ? <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3"><span className="mr-2 text-xs text-muted-foreground">第 {data.page} / {pageCount} 页</span><Button size="sm" variant="outline" className="rounded-full" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button><Button size="sm" variant="outline" className="rounded-full" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>下一页</Button></div> : null}
      </div>
    </section>
  );
}
