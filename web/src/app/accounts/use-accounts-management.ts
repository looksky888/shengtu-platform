import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  buildAccountsSummary,
  buildPaginationItems,
  downloadTokenFile,
  normalizeAccounts,
} from "@/app/accounts/account-utils";
import {
  deleteAccounts,
  fetchAccountTokens,
  fetchAccounts,
  refreshAccounts,
  updateAccount,
  type Account,
  type AccountStatus,
  type AccountType,
} from "@/lib/api";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

export function useAccountsManagement(session: StoredAuthSession, enabled = true) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editType, setEditType] = useState<AccountType>("Free");
  const [editStatus, setEditStatus] = useState<AccountStatus>("正常");
  const [editQuota, setEditQuota] = useState("0");
  const [editProxyUrl, setEditProxyUrl] = useState("");
  const [editProxyTimezone, setEditProxyTimezone] = useState("");
  const [clearProxy, setClearProxy] = useState(false);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const accountsRequestSeq = useRef(0);
  const accountsAbortRef = useRef<AbortController | null>(null);

  const permissions = useMemo(() => ({
    canImportAccounts: hasAPIPermission(session, "POST", "/api/accounts"),
    canRefreshAccounts: hasAPIPermission(session, "POST", "/api/accounts/refresh"),
    canUpdateAccount: hasAPIPermission(session, "POST", "/api/accounts/update"),
    canDeleteAccounts: hasAPIPermission(session, "DELETE", "/api/accounts"),
    canExportTokens: hasAPIPermission(session, "GET", "/api/accounts/tokens"),
  }), [session]);

  const applyAccountItems = useCallback((items: Account[] | null | undefined) => {
    const nextAccounts = normalizeAccounts(items);
    setAccounts(nextAccounts);
    setSelectedIds((prev) => prev.filter((id) => nextAccounts.some((item) => item.id === id)));
    return nextAccounts;
  }, []);

  const [total, setTotal] = useState(0);
  const [queryDebounced, setQueryDebounced] = useState("");
  // Full-pool snapshot for metric cards (must NOT use the current page only).
  const [summaryAccounts, setSummaryAccounts] = useState<Account[]>([]);
  const summaryRequestSeq = useRef(0);
  const summaryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryDebounced(query.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [queryDebounced, typeFilter, statusFilter, pageSize]);

  const loadAccountsSummary = useCallback(async () => {
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    const seq = ++summaryRequestSeq.current;
    try {
      // Omit page/page_size so backend returns the full filtered set (legacy unlimited mode).
      // Respect current type/status/keyword filters so cards match the active list scope.
      const data = await fetchAccounts(
        {
          keyword: queryDebounced || undefined,
          type: typeFilter !== "all" ? typeFilter : undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        },
        { signal: controller.signal },
      );
      if (seq !== summaryRequestSeq.current) return;
      setSummaryAccounts(normalizeAccounts(data.items));
    } catch (error) {
      if (controller.signal.aborted || seq !== summaryRequestSeq.current) return;
      // Keep last good summary on transient errors; table load still surfaces failures.
      console.warn("load accounts summary failed", error);
    }
  }, [queryDebounced, statusFilter, typeFilter]);

  const loadAccounts = useCallback(async (silent = false) => {
    accountsAbortRef.current?.abort();
    const controller = new AbortController();
    accountsAbortRef.current = controller;
    const seq = ++accountsRequestSeq.current;
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchAccounts(
        {
          page,
          page_size: Number(pageSize) || 10,
          keyword: queryDebounced || undefined,
          type: typeFilter !== "all" ? typeFilter : undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        },
        { signal: controller.signal },
      );
      if (seq !== accountsRequestSeq.current) return;
      applyAccountItems(data.items);
      setTotal(typeof data.total === "number" ? data.total : (data.items?.length ?? 0));
      if (typeof data.page === "number" && data.page > 0 && data.page !== page) {
        setPage(data.page);
      }
    } catch (error) {
      if (controller.signal.aborted || seq !== accountsRequestSeq.current) return;
      toast.error(error instanceof Error ? error.message : "加载账户失败");
      setAccounts([]);
      setTotal(0);
    } finally {
      // Latest request always clears loading so aborting a non-silent load can't stick spinner.
      if (seq === accountsRequestSeq.current) setIsLoading(false);
    }
  }, [applyAccountItems, page, pageSize, queryDebounced, statusFilter, typeFilter]);

  useEffect(() => {
    if (enabled) void loadAccounts();
  }, [enabled, loadAccounts]);

  useEffect(() => {
    if (enabled) void loadAccountsSummary();
  }, [enabled, loadAccountsSummary]);

  useEffect(
    () => () => {
      accountsAbortRef.current?.abort();
      summaryAbortRef.current?.abort();
    },
    [],
  );

  // Server already filters/pages — keep names used by the UI.
  // filteredCount for pagination must use server total, not current-page length.
  const filteredAccounts = accounts;
  const filteredCount = total;
  const pageCount = Math.max(1, Math.ceil(Math.max(total, 0) / Number(pageSize)));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * Number(pageSize);
  const currentRows = accounts;
  const allCurrentSelected = currentRows.length > 0 && currentRows.every((row) => selectedIds.includes(row.id));
  const showInitialEmptyState = !isLoading && total === 0 && !queryDebounced && typeFilter === "all" && statusFilter === "all";
  const showFilteredEmptyState = !isLoading && total === 0 && !showInitialEmptyState;
  const summary = useMemo(() => buildAccountsSummary(summaryAccounts), [summaryAccounts]);
  const selectedAccountIds = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return accounts.filter((item) => selectedSet.has(item.id)).map((item) => item.id);
  }, [accounts, selectedIds]);
  const abnormalAccountIds = useMemo(() => accounts.filter((item) => item.status === "异常").map((item) => item.id), [accounts]);
  const paginationItems = useMemo(() => buildPaginationItems(pageCount, safePage), [pageCount, safePage]);

  const handleDeleteAccounts = async (accountIds: string[]) => {
    if (!permissions.canDeleteAccounts) return toast.error("没有删除账号权限");
    if (accountIds.length === 0) return toast.error("请先选择要删除的账户");
    setIsDeleting(true);
    try {
      const data = await deleteAccounts(accountIds);
      toast.success(`删除 ${data.removed ?? 0} 个账户`);
      setSelectedIds([]);
      void loadAccounts(true);
      if (enabled) void loadAccountsSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除账户失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRefreshAccounts = async (accountIds: string[]) => {
    if (!permissions.canRefreshAccounts) return toast.error("没有刷新账号权限");
    if (accountIds.length === 0) return toast.error("没有需要刷新的账户");
    setIsRefreshing(true);
    try {
      const data = await refreshAccounts(accountIds);
      if (data.errors.length > 0) {
        const firstError = data.errors[0]?.error;
        toast.error(`刷新成功 ${data.refreshed} 个，失败 ${data.errors.length} 个${firstError ? `，首个错误：${firstError}` : ""}`);
      } else {
        toast.success(`刷新成功 ${data.refreshed} 个账户`);
      }
      void loadAccounts(true);
      if (enabled) void loadAccountsSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新账户失败");
    } finally {
      setIsRefreshing(false);
    }
  };

  /** Refresh every account in the current filter scope (not just the current page). */
  const handleRefreshAllAccounts = async () => {
    if (!permissions.canRefreshAccounts) return toast.error("没有刷新账号权限");
    setIsRefreshing(true);
    try {
      const data = await fetchAccounts({
        keyword: queryDebounced || undefined,
        type: typeFilter !== "all" ? typeFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      const ids = normalizeAccounts(data.items).map((item) => item.id);
      if (ids.length === 0) {
        toast.error("没有需要刷新的账户");
        return;
      }
      const result = await refreshAccounts(ids);
      if (result.errors.length > 0) {
        const firstError = result.errors[0]?.error;
        toast.error(`刷新成功 ${result.refreshed} 个，失败 ${result.errors.length} 个${firstError ? `，首个错误：${firstError}` : ""}`);
      } else {
        toast.success(`刷新成功 ${result.refreshed} 个账户`);
      }
      void loadAccounts(true);
      if (enabled) void loadAccountsSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新账户失败");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportTokens = async () => {
    if (!permissions.canExportTokens) return toast.error("没有导出 Token 权限");
    setIsExporting(true);
    try {
      const data = await fetchAccountTokens();
      const tokens = (Array.isArray(data.tokens) ? data.tokens : []).map((item) => String(item || "").trim()).filter(Boolean);
      if (tokens.length === 0) return toast.error("暂无可导出的 Token");
      downloadTokenFile(tokens);
      toast.success(`已导出 ${tokens.length} 个 Token`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出 Token 失败");
    } finally {
      setIsExporting(false);
    }
  };

  const openEditDialog = (account: Account) => {
    if (!permissions.canUpdateAccount) return;
    setEditingAccount(account);
    setEditType(account.type);
    setEditStatus(account.status);
    setEditQuota(String(account.quota));
    setEditProxyUrl("");
    setEditProxyTimezone(account.proxy_timezone || "");
    setClearProxy(false);
  };

  const handleUpdateAccount = async () => {
    if (!editingAccount || !permissions.canUpdateAccount) return;
    setIsUpdating(true);
    try {
      await updateAccount(editingAccount.id, {
        type: editType,
        status: editStatus,
        quota: Number(editQuota || 0),
        proxy_url: clearProxy ? undefined : editProxyUrl.trim() || undefined,
        proxy_timezone: clearProxy ? undefined : editProxyTimezone.trim() || undefined,
        clear_proxy: clearProxy || undefined,
      });
      setEditingAccount(null);
      toast.success("账号信息已更新");
      void loadAccounts(true);
      if (enabled) void loadAccountsSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新账号失败");
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentRows.map((item) => item.id)])));
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => !currentRows.some((row) => row.id === id)));
  };

  const handleImported = (_items: Account[]) => {
    setSelectedIds([]);
    setPage(1);
    void loadAccounts(true);
    if (enabled) void loadAccountsSummary();
  };

  return {
    accounts, selectedIds, query, typeFilter, statusFilter, pageSize, editingAccount, editType, editStatus, editQuota,
    editProxyUrl, editProxyTimezone, clearProxy,
    isLoading, isRefreshing, isDeleting, isUpdating, isExporting, permissions, filteredAccounts, filteredCount, pageCount, safePage,
    startIndex, currentRows, allCurrentSelected, showInitialEmptyState, showFilteredEmptyState, summary,
    selectedAccountIds, abnormalAccountIds, paginationItems, setQuery, setTypeFilter, setStatusFilter, setPage,
    setPageSize, setSelectedIds, setEditingAccount, setEditType, setEditStatus, setEditQuota,
    setEditProxyUrl, setEditProxyTimezone, setClearProxy, loadAccounts, loadAccountsSummary,
    handleDeleteAccounts, handleRefreshAccounts, handleRefreshAllAccounts, handleExportTokens, openEditDialog, handleUpdateAccount,
    toggleSelectAll, handleImported,
  };
}
