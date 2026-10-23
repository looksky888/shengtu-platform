"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { AccountImportConfirmDialog } from "@/app/accounts/components/account-import-confirm-dialog";
import { AccountImportFooter } from "@/app/accounts/components/account-import-footer";
import { AccountImportMethodBody } from "@/app/accounts/components/account-import-method-body";
import type { ImportMethod, PendingCpaImport } from "@/app/accounts/components/account-import-types";
import { getCpaAccessToken, getSessionAccessToken, readFileAsText, splitTokens } from "@/app/accounts/components/account-import-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createAccounts, type Account } from "@/lib/api";

type AccountImportDialogProps = {
  disabled?: boolean;
  trigger?: ReactNode;
  onImported: (items: Account[]) => void;
};

const dialogCopy: Record<ImportMethod, { title: string; description: string }> = {
  menu: { title: "导入账户", description: "选择一种导入方式。导入成功后会自动拉取邮箱、类型和额度。" },
  token: { title: "导入 Access Token", description: "支持手动粘贴或从 TXT 文件导入，一行一个 Token。" },
  session: { title: "导入 Session JSON", description: "粘贴完整 Session JSON，系统会自动提取 accessToken。" },
  cpa: { title: "导入 CPA JSON", description: "支持一次读取多个本地 JSON 文件，并在提交前做数量确认。" },
};

export function AccountImportDialog({ disabled, trigger, onImported }: AccountImportDialogProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ImportMethod>("menu");
  const [tokenInput, setTokenInput] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCpaImport, setPendingCpaImport] = useState<PendingCpaImport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const cpaInputRef = useRef<HTMLInputElement | null>(null);
  const copy = dialogCopy[method];

  const resetState = () => {
    setMethod("menu");
    setTokenInput("");
    setSessionInput("");
    setPendingCpaImport(null);
    setConfirmOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetState();
  };

  const submitTokens = async (tokens: string[], successText?: string) => {
    const normalizedTokens = tokens.map((item) => item.trim()).filter(Boolean);
    if (normalizedTokens.length === 0) return toast.error("请先提供至少一个可用 Token");

    setIsSubmitting(true);
    try {
      const data = await createAccounts(normalizedTokens);
      onImported(data.items);
      setOpen(false);
      resetState();

      if ((data.errors?.length ?? 0) > 0) {
        const firstError = data.errors?.[0]?.error;
        toast.error(`${successText ?? "导入完成"}，新增 ${data.added ?? 0} 个，已刷新 ${data.refreshed ?? 0} 个，失败 ${data.errors?.length ?? 0} 个${firstError ? `，首个错误：${firstError}` : ""}`);
      } else {
        toast.success(`${successText ?? "导入完成"}，新增 ${data.added ?? 0} 个，跳过 ${data.skipped ?? 0} 个重复项，已自动刷新账号信息`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入账户失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTxtSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const tokens = splitTokens(await readFileAsText(file));
      if (tokens.length === 0) return toast.error("TXT 文件里没有读取到有效 Token");
      setTokenInput((prev) => [...splitTokens(prev), ...tokens].join("\n"));
      toast.success(`已从 ${file.name} 读取 ${tokens.length} 个 Token`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取 TXT 文件失败");
    }
  };

  const handleImportSessionJson = async () => {
    if (!sessionInput.trim()) return toast.error("请先粘贴完整 Session JSON");

    try {
      const token = getSessionAccessToken(JSON.parse(sessionInput) as unknown);
      if (!token) return toast.error("未从 Session JSON 中提取到 accessToken");
      await submitTokens([token], "Session JSON 导入完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Session JSON 解析失败");
    }
  };

  const handleCpaSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    try {
      const results = await Promise.all(files.map(async (file) => getCpaAccessToken(JSON.parse(await readFileAsText(file)) as unknown)));
      const tokens = results.filter((item): item is string => Boolean(item));
      if (tokens.length === 0) return toast.error("这些 CPA JSON 文件里没有读取到可用 access_token");
      setPendingCpaImport({ tokens, parsedFileCount: tokens.length, errorCount: results.length - tokens.length });
      setConfirmOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取 CPA JSON 文件失败");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm" disabled={disabled}>
              <Upload className="size-3.5" />
              导入账号
            </Button>
          )}
        </DialogTrigger>
        <DialogContent showCloseButton={false} className="rounded-xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription className="text-sm leading-6">{copy.description}</DialogDescription>
          </DialogHeader>
          <AccountImportMethodBody
            method={method}
            tokenInput={tokenInput}
            sessionInput={sessionInput}
            isSubmitting={isSubmitting}
            pendingCpaImport={pendingCpaImport}
            txtInputRef={txtInputRef}
            cpaInputRef={cpaInputRef}
            onMethodChange={setMethod}
            onTokenChange={setTokenInput}
            onSessionChange={setSessionInput}
            onTxtSelected={handleTxtSelected}
            onCpaSelected={handleCpaSelected}
            onRemoteCpa={() => {
              setOpen(false);
              resetState();
              navigate("/settings?tab=imports");
            }}
          />
          <AccountImportFooter
            method={method}
            disabled={disabled || isSubmitting}
            pendingCpaImport={pendingCpaImport}
            isSubmitting={isSubmitting}
            onCancel={() => setOpen(false)}
            onImportToken={() => void submitTokens(splitTokens(tokenInput), "Access Token 导入完成")}
            onImportSession={() => void handleImportSessionJson()}
            onOpenConfirm={() => setConfirmOpen(true)}
          />
        </DialogContent>
      </Dialog>
      <AccountImportConfirmDialog
        open={confirmOpen}
        pendingCpaImport={pendingCpaImport}
        isSubmitting={isSubmitting}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void submitTokens(pendingCpaImport?.tokens ?? [], "CPA JSON 导入完成")}
      />
    </>
  );
}