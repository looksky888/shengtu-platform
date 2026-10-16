import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { formatCreditNumber } from "@/app/profile/profile-utils";
import {
  fetchProfileCreditLedger,
  fetchProfileCredits,
  performProfileCheckin,
  redeemProfileCredits,
  type CreditLedgerEntry,
  type ProfileCredits,
} from "@/lib/api";

const CREDIT_LEDGER_PAGE_SIZE = 10;

export function useProfileCredits() {
  const [credits, setCredits] = useState<ProfileCredits | null>(null);
  const [latestCreditEntry, setLatestCreditEntry] = useState<CreditLedgerEntry | null>(null);
  const [creditLedger, setCreditLedger] = useState<CreditLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [redeemKey, setRedeemKey] = useState("");
  const [creditsError, setCreditsError] = useState("");
  const [isLoadingCredits, setIsLoadingCredits] = useState(true);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [creditLedgerPage, setCreditLedgerPage] = useState(1);

  const creditLedgerPageCount = Math.max(1, Math.ceil(Math.max(ledgerTotal, 0) / CREDIT_LEDGER_PAGE_SIZE));
  const safeCreditLedgerPage = Math.min(Math.max(1, creditLedgerPage), creditLedgerPageCount);
  // Server returns newest-first page; no client re-slice.
  const pagedCreditLedger = creditLedger;
  const displayLatestCreditEntry = latestCreditEntry || (creditLedgerPage === 1 ? creditLedger[0] : null) || null;

  const loadLedgerPage = useCallback(async (page: number, notifyOnError = true) => {
    setIsLoadingLedger(true);
    try {
      const data = await fetchProfileCreditLedger({ page, page_size: CREDIT_LEDGER_PAGE_SIZE });
      const items = Array.isArray(data.items) ? data.items : [];
      setCreditLedger(items);
      const total = typeof data.total === "number" ? data.total : items.length;
      setLedgerTotal(total);
      if (page <= 1 && items[0]) {
        setLatestCreditEntry(items[0]);
      }
    } catch (error) {
      setCreditLedger([]);
      setLedgerTotal(0);
      if (notifyOnError) {
        toast.error(error instanceof Error ? error.message : "加载积分流水失败");
      }
    } finally {
      setIsLoadingLedger(false);
    }
  }, []);

  const loadCredits = useCallback(
    async (notifyOnError = true) => {
      setIsLoadingCredits(true);
      setCreditsError("");
      try {
        const creditsResult = await fetchProfileCredits();
        setCredits(creditsResult);
        setCreditLedgerPage(1);
        await loadLedgerPage(1, notifyOnError);
      } catch (error) {
        const message = error instanceof Error ? error.message : "加载积分信息失败";
        setCreditsError(message);
        if (notifyOnError) {
          toast.error(message);
        }
      } finally {
        setIsLoadingCredits(false);
      }
    },
    [loadLedgerPage],
  );

  // Initial load.
  useEffect(() => {
    void loadCredits(true);
  }, [loadCredits]);

  // Subsequent page flips (skip page 1 here — loadCredits already fetched it).
  useEffect(() => {
    if (creditLedgerPage <= 1) return;
    void loadLedgerPage(creditLedgerPage, true);
  }, [creditLedgerPage, loadLedgerPage]);

  const handleCheckin = async () => {
    if (credits?.checked_in_today) {
      toast.success("今天已经签到过了");
      return;
    }
    setIsCheckingIn(true);
    try {
      const data = await performProfileCheckin();
      setCredits({
        account: data.account,
        balance: data.balance,
        checked_in_today: true,
      });
      setLatestCreditEntry(data.entry);
      if (data.awarded) {
        toast.success(`签到成功，已领取 ${formatCreditNumber(data.entry.delta)} 积分`);
        setCreditLedgerPage(1);
        void loadLedgerPage(1, false);
      } else {
        toast.success("今天已经签到过了");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "签到失败");
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleRedeem = async () => {
    const nextKey = redeemKey.trim();
    if (!nextKey) {
      toast.error("请输入兑换码");
      return;
    }
    setIsRedeeming(true);
    try {
      const data = await redeemProfileCredits(nextKey);
      setCredits((current) => ({
        account: data.account,
        balance: data.balance,
        checked_in_today: current?.checked_in_today ?? false,
      }));
      setLatestCreditEntry(data.entry);
      setRedeemKey("");
      toast.success(`兑换成功，已到账 ${formatCreditNumber(data.card.amount)} 积分`);
      setCreditLedgerPage(1);
      void loadCredits(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "兑换失败");
    } finally {
      setIsRedeeming(false);
    }
  };

  return {
    credits,
    creditsError,
    creditLedger,
    redeemKey,
    isLoadingCredits: isLoadingCredits || isLoadingLedger,
    isCheckingIn,
    isRedeeming,
    displayLatestCreditEntry,
    pagedCreditLedger,
    sortedCreditLedgerLength: ledgerTotal,
    safeCreditLedgerPage,
    creditLedgerPageCount,
    creditLedgerPageSize: CREDIT_LEDGER_PAGE_SIZE,
    setCreditLedgerPage,
    setRedeemKey,
    loadCredits,
    handleCheckin,
    handleRedeem,
  };
}
