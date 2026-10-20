import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  normalizeManagedRoles,
  normalizeManagedUsers,
  type UserCleanupFilter,
  type UserTablePageSize,
  type UserTimeFilter,
} from "@/app/users/users-utils";
import { useUsersManagementActions } from "@/app/users/use-users-management-actions";
import { userCleanupQuery, userManagementPermissions, userTimeBounds } from "@/app/users/users-management-query";
import {
  fetchManagedRoles,
  fetchManagedUsers,
  fetchManagedUsersUsage,
  type CreditAccount,
  type ManagedRole,
  type ManagedUser,
  type ManagedUserUsage,
} from "@/lib/api";
import type { StoredAuthSession } from "@/store/auth";

export function useUsersManagement(session: StoredAuthSession) {
  const permissions = useMemo(() => userManagementPermissions(session), [session]);

  const [items, setItems] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [creditUsers, setCreditUsers] = useState<CreditAccount[]>([]);
  const [searchText, setSearchTextState] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [providerFilter, setProviderFilterState] = useState("all");
  const [statusFilter, setStatusFilterState] = useState("all");
  const [timeFilter, setTimeFilterState] = useState<UserTimeFilter>("all");
  const [cleanupFilter, setCleanupFilterState] = useState<UserCleanupFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<UserTablePageSize>(10);
  const [isLoading, setIsLoading] = useState(true);
  /** Usage is loaded only via loadUsage (scheme B); never from list open. */
  const [usageReady, setUsageReady] = useState(false);
  const [usageByUserId, setUsageByUserId] = useState<Map<string, ManagedUserUsage>>(() => new Map());
  /** Ids key for which usageByUserId is valid; mismatch ⇒ stale after page/filter change. */
  const [usageLoadedKey, setUsageLoadedKey] = useState("");
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const usersRequestSeq = useRef(0);
  const usageRequestSeq = useRef(0);
  const usersAbortRef = useRef<AbortController | null>(null);
  const usageAbortRef = useRef<AbortController | null>(null);

  const pageUsageKey = useMemo(
    () => items.map((user) => user.id).filter(Boolean).join(","),
    [items],
  );
  // Only treat usage as ready when it was loaded for the exact current page ids.
  const usageReadyForPage = usageReady && usageLoadedKey !== "" && usageLoadedKey === pageUsageKey;

  // Prefer per-row credit_balance from server; keep map for adjust dialog updates.
  const creditBalanceByUserId = useMemo(() => {
    const map = new Map<string, number>();
    for (const user of items) {
      if (typeof user.credit_balance === "number") {
        map.set(user.id, user.credit_balance);
      }
    }
    for (const item of creditUsers) {
      if (!map.has(item.user_id)) {
        map.set(item.user_id, item.balance);
      }
    }
    return map;
  }, [items, creditUsers]);

  const hasActiveFilters =
    searchText.trim() !== "" ||
    providerFilter !== "all" ||
    statusFilter !== "all" ||
    timeFilter !== "all" ||
    cleanupFilter !== "all";
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 0) / pageSize));
  const currentPage = Math.min(page, totalPages);
  // Server already pages and filters — no client-side re-windowing.
  const filteredItems = items;
  const pagedItems = items;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchDebounced(searchText.trim());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const setSearchText = useCallback((value: string) => setSearchTextState(value), []);
  const setProviderFilter = useCallback((value: string) => {
    setPage(1);
    setProviderFilterState(value);
  }, []);
  const setStatusFilter = useCallback((value: string) => {
    setPage(1);
    setStatusFilterState(value);
  }, []);
  const setTimeFilter = useCallback((value: UserTimeFilter) => {
    setPage(1);
    setTimeFilterState(value);
  }, []);
  const setCleanupFilter = useCallback((value: UserCleanupFilter) => {
    setPage(1);
    setCleanupFilterState(value);
  }, []);
  const setPageSize = useCallback((value: UserTablePageSize) => {
    setPage(1);
    setPageSizeState(value);
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const data = await fetchManagedRoles();
      const nextRoles = normalizeManagedRoles(data.items);
      setRoles(nextRoles);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载角色失败");
    }
  }, []);

  const loadUsers = useCallback(async () => {
    usersAbortRef.current?.abort();
    // List change invalidates on-demand usage; cancel in-flight usage scan.
    usageAbortRef.current?.abort();
    usageRequestSeq.current += 1;
    setUsageReady(false);
    setUsageByUserId(new Map());
    setUsageLoadedKey("");
    setIsLoadingUsage(false);
    const controller = new AbortController();
    usersAbortRef.current = controller;
    const seq = ++usersRequestSeq.current;
    setIsLoading(true);
    try {
      const bounds = userTimeBounds(timeFilter);
      const cleanupQuery = userCleanupQuery(cleanupFilter);
      const data = await fetchManagedUsers(
        {
          page: page,
          page_size: pageSize,
          keyword: searchDebounced || undefined,
          provider: providerFilter !== "all" ? providerFilter : undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          start_at: bounds.start_at,
          end_at: bounds.end_at,
          ...cleanupQuery,
        },
        { signal: controller.signal },
      );
      if (seq !== usersRequestSeq.current) return;
      const nextItems = normalizeManagedUsers(data.items);
      setItems(nextItems);
      setTotal(typeof data.total === "number" ? data.total : nextItems.length);
      // List never includes usage (scheme B); invalidate page-key binding.
      setUsageReady(false);
      setUsageByUserId(new Map());
      setUsageLoadedKey("");
      // Seed credit map from page balances.
      setCreditUsers(
        nextItems.map((user) => ({
          user_id: user.id,
          balance: typeof user.credit_balance === "number" ? user.credit_balance : 0,
          created_at: "",
          updated_at: "",
        })),
      );
      if (typeof data.page === "number" && data.page > 0 && data.page !== page) {
        setPage(data.page);
      }
    } catch (error) {
      if (controller.signal.aborted || seq !== usersRequestSeq.current) return;
      toast.error(error instanceof Error ? error.message : "加载用户失败");
      setItems([]);
      setTotal(0);
      setUsageReady(false);
      setUsageByUserId(new Map());
      setUsageLoadedKey("");
    } finally {
      if (seq === usersRequestSeq.current) setIsLoading(false);
    }
  }, [cleanupFilter, page, pageSize, providerFilter, searchDebounced, statusFilter, timeFilter]);

  const loadUsage = useCallback(async () => {
    const ids = items.map((user) => user.id).filter(Boolean);
    if (ids.length === 0) {
      toast.info("当前页没有用户，无法加载用量");
      return;
    }
    const requestedKey = ids.join(",");
    usageAbortRef.current?.abort();
    const controller = new AbortController();
    usageAbortRef.current = controller;
    const seq = ++usageRequestSeq.current;
    setIsLoadingUsage(true);
    try {
      const data = await fetchManagedUsersUsage(ids, { days: 14, signal: controller.signal });
      // Drop the result when the page changed or another scan started while this one was in flight.
      if (seq !== usageRequestSeq.current) return;
      // Scheme B: scoped scan is synchronous; store usage off the user row.
      const byId = data.items || {};
      const next = new Map<string, ManagedUserUsage>();
      for (const id of ids) {
        const summary = byId[id];
        if (summary) next.set(id, summary);
      }
      setUsageByUserId(next);
      setUsageLoadedKey(requestedKey);
      setUsageReady(true);
      toast.success("本页用量已加载");
    } catch (error) {
      if (controller.signal.aborted || seq !== usageRequestSeq.current) return;
      toast.error(error instanceof Error ? error.message : "加载用量失败");
    } finally {
      if (usageAbortRef.current === controller) usageAbortRef.current = null;
      if (seq === usageRequestSeq.current) setIsLoadingUsage(false);
    }
  }, [items]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(
    () => () => {
      usersAbortRef.current?.abort();
      usageAbortRef.current?.abort();
    },
    [],
  );

  const actions = useUsersManagementActions({
    permissions,
    roles,
    cleanupFilter,
    loadUsers,
    setItems,
    setCreditUsers,
  });

  const clearFilters = () => {
    setPage(1);
    setSearchTextState("");
    setSearchDebounced("");
    setProviderFilterState("all");
    setStatusFilterState("all");
    setTimeFilterState("all");
    setCleanupFilterState("all");
  };

  return {
    items,
    /** Server-side filtered total (not current page length). */
    total,
    roles,
    permissions,
    searchText,
    providerFilter,
    statusFilter,
    timeFilter,
    cleanupFilter,
    pageSize,
    isLoading,
    /** When false, usage not loaded for this exact page ids yet (list is usage-free). */
    usageReady: usageReadyForPage,
    usageByUserId,
    isLoadingUsage,
    creditBalanceByUserId,
    filteredItems,
    hasActiveFilters,
    totalPages,
    currentPage,
    pagedItems,
    loadUsers,
    loadUsage,
    clearFilters,
    setSearchText,
    setProviderFilter,
    setStatusFilter,
    setTimeFilter,
    setCleanupFilter,
    setPageSize,
    setPage,
    ...actions,
  };
}
