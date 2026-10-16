import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  adminTimeBounds,
  copyGeneratedKeysText,
  normalizeCreditCards,
  normalizeCreditLedger,
  normalizeCreditUsers,
  pagedResult,
  type AdminTablePageSize,
  type TimeFilter,
} from "@/app/credits-admin/credits-admin-utils";
import { useCreditsAdminActions } from "@/app/credits-admin/use-credits-admin-actions";
import {
  fetchCreditCards,
  fetchCreditLedger,
  fetchCreditUsers,
  type CreditAccount,
  type CreditCard,
  type CreditLedgerEntry,
} from "@/lib/api";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

export function useCreditsAdmin(session: StoredAuthSession) {
  const permissions = useMemo(
    () => ({
      canManageCredits: hasAPIPermission(session, "POST", "/api/admin/credits"),
    }),
    [session],
  );

  const [cards, setCards] = useState<CreditCard[]>([]);
  const [cardsTotal, setCardsTotal] = useState(0);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [users, setUsers] = useState<CreditAccount[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [totalBalance, setTotalBalance] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const [activeCardCount, setActiveCardCount] = useState(0);
  const [usedCardCount, setUsedCardCount] = useState(0);

  const [cardsPage, setCardsPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [cardsPageSize, setCardsPageSize] = useState<AdminTablePageSize>(10);
  const [ledgerPageSize, setLedgerPageSize] = useState<AdminTablePageSize>(20);
  const [usersPageSize, setUsersPageSize] = useState<AdminTablePageSize>(10);

  const [cardsSearch, setCardsSearch] = useState("");
  const [cardsSearchDebounced, setCardsSearchDebounced] = useState("");
  const [cardsStatus, setCardsStatus] = useState("all");
  const [cardsTime, setCardsTime] = useState<TimeFilter>("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSearchDebounced, setLedgerSearchDebounced] = useState("");
  const [ledgerReason, setLedgerReason] = useState("all");
  const [ledgerTime, setLedgerTime] = useState<TimeFilter>("all");
  const [usersSearch, setUsersSearch] = useState("");
  const [usersSearchDebounced, setUsersSearchDebounced] = useState("");
  const [usersTime, setUsersTime] = useState<TimeFilter>("all");

  const [isCardsLoading, setIsCardsLoading] = useState(true);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");

  const cardsRequestSeq = useRef(0);
  const usersRequestSeq = useRef(0);
  const ledgerRequestSeq = useRef(0);
  const cardsAbortRef = useRef<AbortController | null>(null);
  const usersAbortRef = useRef<AbortController | null>(null);
  const ledgerAbortRef = useRef<AbortController | null>(null);

  // Server already pages — keep legacy shape expected by section components.
  const filteredCards = cards;
  const filteredUsers = users;
  const filteredLedger = ledger;
  const pagedCards = useMemo(
    () => pagedResult(cards, cardsTotal, cardsPage, cardsPageSize),
    [cards, cardsPage, cardsPageSize, cardsTotal],
  );
  const pagedUsers = useMemo(
    () => pagedResult(users, usersTotal, usersPage, usersPageSize),
    [users, usersPage, usersPageSize, usersTotal],
  );
  const pagedLedger = useMemo(
    () => pagedResult(ledger, ledgerTotal, ledgerPage, ledgerPageSize),
    [ledger, ledgerPage, ledgerPageSize, ledgerTotal],
  );

  const isLoading = isCardsLoading || isUsersLoading;

  useEffect(() => {
    setCardsPage(1);
  }, [cardsSearchDebounced, cardsStatus, cardsTime, cardsPageSize]);
  useEffect(() => {
    setUsersPage(1);
  }, [usersSearchDebounced, usersTime, usersPageSize]);
  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerReason, ledgerSearchDebounced, ledgerTime, ledgerPageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCardsSearchDebounced(cardsSearch.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [cardsSearch]);
  useEffect(() => {
    const timer = window.setTimeout(() => setUsersSearchDebounced(usersSearch.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [usersSearch]);
  useEffect(() => {
    const timer = window.setTimeout(() => setLedgerSearchDebounced(ledgerSearch.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [ledgerSearch]);

  const loadCards = useCallback(async () => {
    cardsAbortRef.current?.abort();
    const controller = new AbortController();
    cardsAbortRef.current = controller;
    const seq = ++cardsRequestSeq.current;
    setIsCardsLoading(true);
    try {
      const bounds = adminTimeBounds(cardsTime);
      const data = await fetchCreditCards(
        {
          page: cardsPage,
          page_size: cardsPageSize,
          keyword: cardsSearchDebounced || undefined,
          status: cardsStatus !== "all" ? cardsStatus : undefined,
          start_at: bounds.start_at,
          end_at: bounds.end_at,
        },
        { signal: controller.signal },
      );
      if (seq !== cardsRequestSeq.current) return;
      setCards(normalizeCreditCards(data.items));
      setCardsTotal(typeof data.total === "number" ? data.total : 0);
      setActiveCardCount(typeof data.active_count === "number" ? data.active_count : 0);
      setUsedCardCount(typeof data.used_count === "number" ? data.used_count : 0);
      if (typeof data.page === "number" && data.page > 0 && data.page !== cardsPage) {
        setCardsPage(data.page);
      }
    } catch (error) {
      if (controller.signal.aborted || seq !== cardsRequestSeq.current) return;
      toast.error(error instanceof Error ? error.message : "加载卡密列表失败");
      setCards([]);
      setCardsTotal(0);
    } finally {
      if (seq === cardsRequestSeq.current) setIsCardsLoading(false);
    }
  }, [cardsPage, cardsPageSize, cardsSearchDebounced, cardsStatus, cardsTime]);

  const loadUsers = useCallback(async () => {
    usersAbortRef.current?.abort();
    const controller = new AbortController();
    usersAbortRef.current = controller;
    const seq = ++usersRequestSeq.current;
    setIsUsersLoading(true);
    try {
      const bounds = adminTimeBounds(usersTime);
      const data = await fetchCreditUsers(
        {
          page: usersPage,
          page_size: usersPageSize,
          keyword: usersSearchDebounced || undefined,
          start_at: bounds.start_at,
          end_at: bounds.end_at,
        },
        { signal: controller.signal },
      );
      if (seq !== usersRequestSeq.current) return;
      setUsers(normalizeCreditUsers(data.items));
      setUsersTotal(typeof data.total === "number" ? data.total : 0);
      setTotalBalance(typeof data.total_balance === "number" ? data.total_balance : 0);
      setAccountCount(typeof data.account_count === "number" ? data.account_count : 0);
      if (typeof data.page === "number" && data.page > 0 && data.page !== usersPage) {
        setUsersPage(data.page);
      }
    } catch (error) {
      if (controller.signal.aborted || seq !== usersRequestSeq.current) return;
      toast.error(error instanceof Error ? error.message : "加载用户余额失败");
      setUsers([]);
      setUsersTotal(0);
    } finally {
      if (seq === usersRequestSeq.current) setIsUsersLoading(false);
    }
  }, [usersPage, usersPageSize, usersSearchDebounced, usersTime]);

  const loadLedger = useCallback(async () => {
    ledgerAbortRef.current?.abort();
    const controller = new AbortController();
    ledgerAbortRef.current = controller;
    const seq = ++ledgerRequestSeq.current;
    setIsLedgerLoading(true);
    setLedgerError("");
    try {
      const bounds = adminTimeBounds(ledgerTime);
      const data = await fetchCreditLedger(
        {
          page: ledgerPage,
          page_size: ledgerPageSize,
          keyword: ledgerSearchDebounced || undefined,
          reason: ledgerReason !== "all" ? ledgerReason : undefined,
          start_at: bounds.start_at,
          end_at: bounds.end_at,
        },
        { signal: controller.signal },
      );
      if (seq !== ledgerRequestSeq.current) return;
      setLedger(normalizeCreditLedger(data.items));
      setLedgerTotal(typeof data.total === "number" ? data.total : 0);
      if (typeof data.page === "number" && data.page > 0 && data.page !== ledgerPage) {
        setLedgerPage(data.page);
      }
    } catch (error) {
      if (controller.signal.aborted || seq !== ledgerRequestSeq.current) return;
      const message = error instanceof Error ? error.message : "加载积分流水失败";
      setLedgerError(message);
      setLedger([]);
      setLedgerTotal(0);
    } finally {
      if (seq === ledgerRequestSeq.current) setIsLedgerLoading(false);
    }
  }, [ledgerPage, ledgerPageSize, ledgerReason, ledgerSearchDebounced, ledgerTime]);

  const loadData = useCallback(async () => {
    await Promise.all([loadCards(), loadUsers(), loadLedger()]);
  }, [loadCards, loadUsers, loadLedger]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);
  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(
    () => () => {
      cardsAbortRef.current?.abort();
      usersAbortRef.current?.abort();
      ledgerAbortRef.current?.abort();
    },
    [],
  );

  const actions = useCreditsAdminActions({
    canManageCredits: permissions.canManageCredits,
    loadCards,
    loadUsers,
    loadLedger,
    setCardsPage,
    setLedgerPage,
  });

  return {
    permissions,
    cards,
    users,
    ledger,
    cardsTotal,
    usersTotal,
    ledgerTotal,
    totalBalance,
    accountCount,
    activeCardCount,
    usedCardCount,
    filteredCards,
    filteredLedger,
    filteredUsers,
    pagedCards,
    pagedLedger,
    pagedUsers,
    cardsSearch,
    cardsStatus,
    cardsTime,
    ledgerSearch,
    ledgerReason,
    ledgerTime,
    usersSearch,
    usersTime,
    cardsPageSize,
    ledgerPageSize,
    usersPageSize,
    ledgerPage,
    isLoading,
    isCardsLoading,
    isUsersLoading,
    isLedgerLoading,
    ledgerError,
    setCardsSearch,
    setCardsStatus,
    setCardsTime,
    setLedgerSearch,
    setLedgerReason,
    setLedgerTime,
    setUsersSearch,
    setUsersTime,
    setCardsPage,
    setLedgerPage,
    setUsersPage,
    setCardsPageSize,
    setLedgerPageSize,
    setUsersPageSize,
    loadData,
    loadLedger,
    ...actions,
    copyGeneratedKeysText,
  };
}

export type CreditsAdminState = ReturnType<typeof useCreditsAdmin>;
