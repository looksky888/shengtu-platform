import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  deleteGrokAccounts,
  exportGrokAccounts,
  getGrokOAuthProtocolJob,
  importGrokAccounts,
  listGrokAccounts,
  refreshGrokAccountsRuntime,
  setGrokAccountsDisabled,
  startGrokOAuthProtocol,
  syncGrokAccountsToRuntime,
  type GrokAccount,
  type GrokAccountsSummary,
  type GrokQuotaMode,
} from "@/lib/grok-accounts-api";

function quotaModeTotal(summary: GrokAccountsSummary | undefined, mode: GrokQuotaMode): number {
  const value = summary?.quota?.[mode];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function useGrokAccounts() {
  const [items, setItems] = useState<GrokAccount[]>([]);
  const [summary, setSummary] = useState<GrokAccountsSummary>({});
  const [runtimeAvailable, setRuntimeAvailable] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [error, setError] = useState("");
  const [oauthPanelOpen, setOauthPanelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listGrokAccounts({ page: 1, page_size: 200, keyword, status });
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || {});
      setRuntimeAvailable(Boolean(data.runtime_available));
      if (data.runtime_error) setError(data.runtime_error);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "加载 Grok 号池失败";
      setError(message);
      setItems([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [keyword, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = items.length > 0 && selected.length === items.length;
  const metrics = useMemo(() => {
    const runtimeStatus = summary.runtime_status || {};
    const media = summary.media || {};
    return [
      { label: "档案总计", value: summary.total ?? items.length },
      { label: "已入池", value: summary.synced ?? summary.runtime_total ?? 0 },
      { label: "OAuth", value: summary.oauth_linked ?? summary.oauth_total ?? 0, className: "text-sky-600" },
      { label: "运行正常", value: runtimeStatus.active ?? 0, className: "text-emerald-600" },
      { label: "限流", value: runtimeStatus.cooling ?? 0, className: "text-amber-600" },
      { label: "异常", value: runtimeStatus.invalid ?? 0, className: "text-rose-600" },
      { label: "图片可用账号", value: media.image?.available ?? 0, className: "text-emerald-600" },
      { label: "视频支持账号", value: media.video?.supported ?? 0, className: "text-sky-600" },
      { label: "视频可用账号", value: media.video?.available ?? 0, className: "text-emerald-600" },
      { label: "额度 A", value: quotaModeTotal(summary, "auto") },
      { label: "额度 F", value: quotaModeTotal(summary, "fast") },
      { label: "额度 E", value: quotaModeTotal(summary, "expert") },
      { label: "额度 H", value: quotaModeTotal(summary, "heavy") },
      { label: "额度 C", value: quotaModeTotal(summary, "console") },
    ];
  }, [summary, items.length]);

  async function pollOAuthJob(jobId: string) {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        const { job } = await getGrokOAuthProtocolJob(jobId);
        const jobStatus = String(job?.status || "").toLowerCase();
        if (jobStatus === "authorized" || jobStatus === "completed") {
          const models = Array.isArray(job?.models) ? job.models.join(", ") : "";
          toast.success(models ? `OAuth 完成：${models}` : "OAuth 协议授权完成");
          return true;
        }
        if (jobStatus === "failed") {
          toast.error(String(job?.error || job?.message || "OAuth 协议授权失败"));
          return false;
        }
      } catch {
        // 任务可能尚未可见，继续轮询。
      }
    }
    toast.message("OAuth 仍在后台进行，请稍后刷新列表查看关联状态");
    return false;
  }

  async function handleStartOAuth(accountIds?: string[]) {
    const targets = accountIds?.length
      ? accountIds
      : selected.length
        ? selected
        : items.filter((item) => item.has_password && !item.oauth).map((item) => item.id).slice(0, 1);
    if (targets.length === 0) {
      toast.error("没有可授权账号：需要已保存密码且尚未关联 OAuth 的注册账号");
      return;
    }
    setBusy(true);
    try {
      let started = 0;
      for (const id of targets) {
        const result = await startGrokOAuthProtocol(id);
        const jobId = String(result.job?.id || "");
        if (!jobId) {
          toast.error(`账号 ${id} 启动 OAuth 失败：无任务 id`);
          continue;
        }
        started += 1;
        toast.message(result.reused ? `OAuth 任务已在运行：${jobId.slice(0, 18)}…` : `OAuth 已启动：${jobId.slice(0, 18)}…`);
        if (started === 1) await pollOAuthJob(jobId);
      }
      if (started > 1) toast.message(`已提交 ${started} 个 OAuth 任务，请稍后刷新查看关联`);
      await load();
    } catch (startError) {
      toast.error(startError instanceof Error ? startError.message : "启动 OAuth 失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    const tokens = importText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    if (tokens.length === 0) return toast.error("请粘贴 sso / token（每行一个）");
    setBusy(true);
    try {
      const result = await importGrokAccounts({ tokens, source_type: "manual" });
      toast.success(`导入完成：新增 ${result.added}，跳过 ${result.skipped}`);
      setImportText("");
      setImportOpen(false);
      await load();
    } catch (importError) {
      toast.error(importError instanceof Error ? importError.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (selected.length === 0 || !window.confirm(`确认删除 ${selected.length} 个 Grok 账号？`)) return;
    setBusy(true);
    try {
      const result = await deleteGrokAccounts(selected);
      toast.success(`已删除 ${result.deleted ?? result.removed ?? selected.length}`);
      setSelected([]);
      await load();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(disabled: boolean) {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const result = await setGrokAccountsDisabled(selected, disabled);
      toast.success(disabled ? `已禁用 ${result.updated}` : `已启用 ${result.updated}`);
      setSelected([]);
      await load();
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshQuota(ids?: string[]) {
    setBusy(true);
    try {
      const result = await refreshGrokAccountsRuntime(ids);
      const ok = result.summary?.ok ?? 0;
      const fail = result.summary?.fail ?? 0;
      if (result.error) toast.error(result.error);
      else toast.success(`额度刷新完成：成功 ${ok}，失败 ${fail}`);
      await load();
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : "刷新额度失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncRuntime() {
    setBusy(true);
    try {
      const result = await syncGrokAccountsToRuntime();
      toast.success(`已同步到内置号池：新增 ${result.added ?? 0}，更新 ${result.updated ?? 0}（池=${result.pool || "super"}）`);
      await load();
    } catch (syncError) {
      toast.error(syncError instanceof Error ? syncError.message : "同步号池失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    try {
      const data = await exportGrokAccounts("json");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `grok-accounts-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("已导出");
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  return {
    items, runtimeAvailable, keyword, setKeyword, status, setStatus, loading, busy, selected, setSelected,
    importOpen, setImportOpen, importText, setImportText, error, oauthPanelOpen, setOauthPanelOpen,
    allSelected, metrics, load, handleStartOAuth, handleImport, handleDelete, handleDisable,
    handleRefreshQuota, handleSyncRuntime, handleExport,
  };
}

export type GrokAccountsController = ReturnType<typeof useGrokAccounts>;
