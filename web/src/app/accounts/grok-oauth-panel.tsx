"use client";

import { KeyRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { GrokOAuthAccountsTable } from "./grok-oauth-accounts-table";
import { GrokOAuthConnectors } from "./grok-oauth-connectors";
import { GrokOAuthTestPanel } from "./grok-oauth-test-panel";
import { useGrokOAuthPanel } from "./use-grok-oauth-panel";

type Props = {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export function GrokOAuthPanel({ open, onClose, onChanged }: Props) {
  const controller = useGrokOAuthPanel(open, onChanged);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <KeyRound className="size-5 text-sky-600" />Grok OAuth 接入
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {controller.accounts.length} 个 OAuth 账号
              {controller.availableModels.length ? ` · 已探测 ${controller.availableModels.join("、")}` : " · 暂无已探测模型"}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <GrokOAuthConnectors controller={controller} />
          <GrokOAuthTestPanel controller={controller} />
          <GrokOAuthAccountsTable controller={controller} />
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>完成</Button>
        </div>
      </div>
    </div>
  );
}
