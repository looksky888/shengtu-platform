import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { downloadBlob } from "@/lib/image-download";
import {
  createGrokProviderConcurrencyTask,
  createGrokProviderConversionTask,
  createGrokProviderDetectionTask,
  createGrokProviderEgressTask,
  createGrokProviderImportTask,
  createGrokProviderQuotaTask,
  createGrokProviderStatusTask,
  exportGrokProviderAccounts,
  getGrokProviderConversionTask,
  listActiveGrokProviderConversionTasks,
  listGrokProviderAccounts,
  type GrokProvider,
  type GrokProviderAccount,
  type GrokProviderAccountsResponse,
  type GrokProviderConversionTask,
  type GrokProviderExportMode,
  type GrokProviderStatus,
} from "@/lib/grok-provider-accounts-api";

export type GrokProviderFilter = GrokProvider | "all";
export type GrokProviderStatusFilter = GrokProviderStatus | "all";

function taskFailureMessage(task: GrokProviderConversionTask) {
  const failures = task.result.failures || [];
  if (failures.length) {
    const codes = [...new Set(failures.map((item) => item.code))];
    return `任务失败 ${failures.length} 项：${codes.join("、")}`;
  }
  return task.error?.code || "provider_task_failed";
}

function downloadJson(value: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), filename);
}

export function useGrokProviderCenter(enabled = true) {
  const [provider, setProvider] = useState<GrokProviderFilter>("all");
  const [status, setStatus] = useState<GrokProviderStatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<GrokProviderAccountsResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [task, setTask] = useState<GrokProviderConversionTask | null>(null);
  const [taskAutoOpen, setTaskAutoOpen] = useState(false);
  const handledTask = useRef("");
  const successMessages = useRef(new Map<string, string>());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const nextData = await listGrokProviderAccounts({ page, page_size: pageSize, provider, status, keyword }, signal);
      setData(nextData);
      setActionError("");
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Grok 账号加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [keyword, page, pageSize, provider, status]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    listActiveGrokProviderConversionTasks(controller.signal)
      .then(({ items }) => {
        const latest = [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
        if (latest) {
          setTaskAutoOpen(false);
          setTask(latest);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && data) {
          setActionError(reason instanceof Error ? reason.message : "恢复账号任务失败");
        }
      });
    return () => controller.abort();
  }, [data, enabled]);

  useEffect(() => {
    if (!task) return;
    const running = task.status === "queued" || task.status === "running";
    setBusy(running);
    if (!running) {
      if (handledTask.current === task.id) return;
      handledTask.current = task.id;
      if (task.status === "succeeded") {
        const failed = Number(task.result.failed || 0);
        const message = successMessages.current.get(task.id) || "账号任务已完成";
        if (failed > 0) toast.warning(`${message}，${failed} 项需检查`);
        else toast.success(message);
        setSelected([]);
        void load();
      } else {
        const message = taskFailureMessage(task);
        setActionError(message);
        toast.error(message);
      }
      successMessages.current.delete(task.id);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getGrokProviderConversionTask(task.id, controller.signal)
        .then(({ task: next }) => setTask(next))
        .catch((reason) => {
          if (!controller.signal.aborted) {
            setActionError(reason instanceof Error ? reason.message : "刷新账号任务失败");
          }
        });
    }, 900);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [load, task]);

  const selectedAccounts = useMemo(
    () => (data?.items || []).filter((item) => selected.includes(item.id)),
    [data?.items, selected],
  );
  const selectedProvider = useMemo(() => {
    const values = new Set(selectedAccounts.map((item) => item.provider));
    return values.size === 1 ? [...values][0] : null;
  }, [selectedAccounts]);
  const allPageSelected = Boolean(data?.items.length) && data!.items.every((item) => selected.includes(item.id));
  const somePageSelected = Boolean(data?.items.some((item) => selected.includes(item.id)));
  const pageSelectionState: boolean | "indeterminate" = allPageSelected ? true : somePageSelected ? "indeterminate" : false;
  const pageCount = Math.max(1, Math.ceil((data?.total || 0) / (data?.page_size || pageSize)));

  const resetView = (updates: () => void) => {
    updates();
    setPage(1);
    setSelected([]);
  };
  const toggle = (id: string, checked: boolean) => setSelected((current) =>
    checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  const togglePage = (checked: boolean) => setSelected((current) => {
    const pageIds = (data?.items || []).map((item) => item.id);
    return checked ? [...new Set([...current, ...pageIds])] : current.filter((id) => !pageIds.includes(id));
  });

  async function runTask(
    request: Promise<{ task: GrokProviderConversionTask; reused: boolean }>,
    successMessage: string,
  ) {
    setBusy(true);
    setActionError("");
    try {
      const current = (await request).task;
      successMessages.current.set(current.id, successMessage);
      handledTask.current = "";
      setTaskAutoOpen(true);
      setTask(current);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "账号任务执行失败";
      setActionError(message);
      toast.error(message);
      setBusy(false);
      return false;
    }
  }

  type TaskScope = { provider: GrokProvider; ids: string[] };
  const requireScope = (): TaskScope | null => {
    if (!selectedAccounts.length) toast.error("请先选择账号");
    else if (!selectedProvider) toast.error("批量操作必须选择同一 Provider 的账号");
    else return { provider: selectedProvider, ids: selectedAccounts.map((item) => item.id) };
    return null;
  };

  const accountScope = (account: GrokProviderAccount): TaskScope => ({ provider: account.provider, ids: [account.id] });
  const resolveScope = (scope?: TaskScope) => scope || requireScope();

  const importAccounts = (
    target: GrokProvider,
    document: string,
    options: { autoSyncQuota: boolean; convertToConsole: boolean },
  ) => runTask(createGrokProviderImportTask(target, document, options), "账号导入与后处理完成");
  const setEnabled = (enabled: boolean, requestedScope?: TaskScope) => {
    const scope = resolveScope(requestedScope);
    if (scope) void runTask(createGrokProviderStatusTask(scope.provider, scope.ids, enabled), enabled ? "账号已启用" : "账号已停用");
  };
  const setConcurrency = (value: number, requestedScope?: TaskScope) => {
    const scope = resolveScope(requestedScope);
    if (scope) void runTask(createGrokProviderConcurrencyTask(scope.provider, scope.ids, value), "并发配置已更新");
  };
  const setEgress = (mode: "inherit" | "direct" | "proxy", proxyUrl: string, requestedScope?: TaskScope) => {
    const scope = resolveScope(requestedScope);
    if (scope) void runTask(createGrokProviderEgressTask(scope.provider, scope.ids, mode, proxyUrl), "出口配置已更新");
  };
  const syncQuota = (requestedScope?: TaskScope) => {
    const scope = resolveScope(requestedScope);
    if (scope) void runTask(createGrokProviderQuotaTask(scope.provider, scope.ids), "额度同步完成");
  };
  const detect = (requestedScope?: TaskScope) => {
    const scope = resolveScope(requestedScope);
    if (scope) void runTask(createGrokProviderDetectionTask(scope.provider, scope.ids), "账号检测完成");
  };
  const convert = (target: "build" | "console", requestedScope?: TaskScope) => {
    const scope = resolveScope(requestedScope);
    if (!scope) return;
    if (scope.provider !== "web") return toast.error("只有 Web 账号支持转换");
    void runTask(createGrokProviderConversionTask(target, "all", scope.ids), `${target === "build" ? "Build" : "Console"} 转换完成`);
  };
  const exportAccounts = async (mode: GrokProviderExportMode, requestedScope?: TaskScope) => {
    const scope = resolveScope(requestedScope);
    if (!scope) return;
    setBusy(true);
    try {
      const result = await exportGrokProviderAccounts(scope.provider, scope.ids, mode);
      downloadJson(result, `grok-${scope.provider}-${mode}-${Date.now()}.json`);
      toast.success(`已导出 ${result.count} 个账号`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "账号导出失败");
    } finally {
      setBusy(false);
    }
  };

  return {
    provider, status, keyword, page, pageSize, data, selected, selectedAccounts, selectedProvider,
    loading, busy, error, actionError, clearActionError: () => setActionError(""),
    task, taskAutoOpen, allPageSelected, pageSelectionState, pageCount, setSelected, load,
    setPage: (value: number) => { setPage(value); setSelected([]); },
    setPageSize: (value: number) => resetView(() => setPageSize(value)),
    setProvider: (value: GrokProviderFilter) => resetView(() => setProvider(value)),
    setStatus: (value: GrokProviderStatusFilter) => resetView(() => setStatus(value)),
    setKeyword: (value: string) => resetView(() => setKeyword(value)),
    toggle, togglePage, importAccounts, setEnabled, setConcurrency, setEgress,
    syncQuota, detect, convert, exportAccounts, accountScope,
  };
}

export type GrokProviderCenterController = ReturnType<typeof useGrokProviderCenter>;
export type GrokProviderRow = GrokProviderAccount;
