import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  normalizeGeneratedCreditCards,
} from "@/app/credits-admin/credits-admin-utils";
import {
  adjustUserCredits,
  disableCreditCard,
  generateCreditCards,
  type CreditAccount,
  type CreditCard,
  type GeneratedCreditCard,
} from "@/lib/api";
import { copyText } from "@/lib/clipboard";

type CreditsAdminActionsOptions = {
  canManageCredits: boolean;
  loadCards: () => Promise<void>;
  loadUsers: () => Promise<void>;
  loadLedger: () => Promise<void>;
  setCardsPage: (page: number) => void;
  setLedgerPage: (page: number) => void;
};

export function useCreditsAdminActions(options: CreditsAdminActionsOptions) {
  const {
    canManageCredits,
    loadCards,
    loadUsers,
    loadLedger,
    setCardsPage,
    setLedgerPage,
  } = options;
  const [generatedCards, setGeneratedCards] = useState<GeneratedCreditCard[]>([]);
  const [generateAmount, setGenerateAmount] = useState("1");
  const [generateCount, setGenerateCount] = useState("1");
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disablingCard, setDisablingCard] = useState<CreditCard | null>(null);
  const [copyAssistText, setCopyAssistText] = useState("");
  const [adjustingAccount, setAdjustingAccount] = useState<CreditAccount | null>(null);
  const [manualAdjustUserId, setManualAdjustUserId] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("-10");
  const [adjustReason, setAdjustReason] = useState("人工扣减");
  const [isAdjustingCredits, setIsAdjustingCredits] = useState(false);

  const handleCopy = useCallback(async (value: string) => {
    try {
      const result = await copyText(value);
      if (result.method === "clipboard") return toast.success("已复制到剪贴板");
      setCopyAssistText(value);
      toast.success("已尝试复制；若未成功，请在弹窗中手动复制");
    } catch {
      setCopyAssistText(value);
      toast.error("复制失败，请手动复制");
    }
  }, []);

  const handleGenerateCards = async () => {
    if (!canManageCredits) return toast.error("没有管理积分权限");
    const amount = Math.trunc(Number(generateAmount));
    const count = Math.trunc(Number(generateCount));
    if (!Number.isFinite(amount) || amount < 1) return toast.error("请输入大于 0 的积分面值");
    if (amount > 1_000_000) return toast.error("单张卡密面值不能超过 1000000");
    if (!Number.isFinite(count) || count < 1) return toast.error("请输入正确的生成数量");
    if (count > 100) return toast.error("单次最多生成 100 张卡密");
    setIsGenerating(true);
    try {
      const data = await generateCreditCards(amount, count);
      const nextItems = normalizeGeneratedCreditCards(data.items);
      setGeneratedCards(nextItems);
      setIsGenerateDialogOpen(false);
      setGenerateAmount("1");
      setGenerateCount("1");
      toast.success(`已生成 ${nextItems.length} 个兑换码`);
      setCardsPage(1);
      void loadCards();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成卡密失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDisableCard = async () => {
    if (!disablingCard) return;
    if (!canManageCredits) return toast.error("没有管理积分权限");
    setIsDisabling(true);
    try {
      await disableCreditCard(disablingCard.id);
      setDisablingCard(null);
      toast.success("卡密已禁用");
      void loadCards();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "禁用卡密失败");
    } finally {
      setIsDisabling(false);
    }
  };

  const openAdjustCreditsDialog = (account: CreditAccount, mode: "add" | "deduct") => {
    if (!canManageCredits) return toast.error("没有管理积分权限");
    setAdjustingAccount(account);
    setManualAdjustUserId(account.user_id);
    setAdjustDelta(mode === "add" ? "10" : "-10");
    setAdjustReason(mode === "add" ? "后台加积分" : "人工扣减");
  };

  const openManualAdjustCreditsDialog = () => {
    if (!canManageCredits) return toast.error("没有管理积分权限");
    setAdjustingAccount({
      user_id: "",
      balance: 0,
      created_at: null,
      updated_at: null,
    });
    setManualAdjustUserId("");
    setAdjustDelta("50");
    setAdjustReason("后台加积分");
  };

  const resetAdjustDialog = () => {
    setAdjustingAccount(null);
    setManualAdjustUserId("");
    setAdjustDelta("-10");
    setAdjustReason("人工扣减");
  };

  const handleAdjustUserCredits = async () => {
    if (!adjustingAccount) return;
    if (!canManageCredits) return toast.error("没有管理积分权限");
    const targetUserId = (adjustingAccount.user_id || manualAdjustUserId).trim();
    if (!targetUserId) return toast.error("请输入目标用户 ID");
    const delta = Math.trunc(Number(adjustDelta));
    if (!Number.isFinite(delta) || delta === 0) return toast.error("请输入非 0 的积分调整值");
    setIsAdjustingCredits(true);
    try {
      await adjustUserCredits(targetUserId, delta, adjustReason.trim() || undefined);
      resetAdjustDialog();
      toast.success(delta > 0 ? "积分已增加" : "积分已扣减");
      void loadUsers();
      setLedgerPage(1);
      void loadLedger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "调整积分失败");
    } finally {
      setIsAdjustingCredits(false);
    }
  };

  return {
    generatedCards,
    generateAmount,
    generateCount,
    isGenerateDialogOpen,
    isGenerating,
    isDisabling,
    disablingCard,
    copyAssistText,
    adjustingAccount,
    manualAdjustUserId,
    adjustDelta,
    adjustReason,
    isAdjustingCredits,
    setGeneratedCards,
    setGenerateAmount,
    setGenerateCount,
    setIsGenerateDialogOpen,
    setDisablingCard,
    setCopyAssistText,
    setAdjustingAccount,
    setManualAdjustUserId,
    setAdjustDelta,
    setAdjustReason,
    handleCopy,
    handleGenerateCards,
    handleDisableCard,
    openAdjustCreditsDialog,
    openManualAdjustCreditsDialog,
    resetAdjustDialog,
    handleAdjustUserCredits,
  };
}
