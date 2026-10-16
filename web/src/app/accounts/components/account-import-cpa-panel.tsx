import type { ChangeEvent, RefObject } from "react";
import { Files } from "lucide-react";

import { AccountImportBackButton } from "@/app/accounts/components/account-import-back-button";
import type { PendingCpaImport } from "@/app/accounts/components/account-import-types";
import { Button } from "@/components/ui/button";

type AccountImportCpaPanelProps = {
  pendingCpaImport: PendingCpaImport | null;
  isSubmitting: boolean;
  cpaInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onCpaSelected: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function AccountImportCpaPanel({ pendingCpaImport, isSubmitting, cpaInputRef, onBack, onCpaSelected }: AccountImportCpaPanelProps) {
  return (
    <div className="space-y-4">
      <AccountImportBackButton onClick={onBack} />
      <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-5">
        <div className="space-y-2">
          <div className="text-sm font-medium text-stone-800">多选本地 CPA JSON 文件</div>
          <div className="text-sm leading-6 text-stone-500">
            每个文件应为一个 JSON 对象。系统会从对象中自动提取 `access_token` 或 `accessToken`。
          </div>
        </div>
        <Button
          type="button"
          className="mt-4 rounded-xl bg-stone-950 text-white hover:bg-stone-800"
          onClick={() => cpaInputRef.current?.click()}
          disabled={isSubmitting}
        >
          <Files className="size-4" />
          选择多个 JSON 文件
        </Button>
      </div>
      <input
        ref={cpaInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(event) => onCpaSelected(event)}
      />
      {pendingCpaImport ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-600">
          最近一次读取到 {pendingCpaImport.parsedFileCount} 个 Token
          {pendingCpaImport.errorCount > 0 ? `，另有 ${pendingCpaImport.errorCount} 个文件未提取成功` : ""}。
        </div>
      ) : null}
    </div>
  );
}