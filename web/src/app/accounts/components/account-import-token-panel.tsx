import type { ChangeEvent, RefObject } from "react";
import { FileText } from "lucide-react";

import { AccountImportBackButton } from "@/app/accounts/components/account-import-back-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AccountImportTokenPanelProps = {
  tokenInput: string;
  tokenCount: number;
  isSubmitting: boolean;
  txtInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onTokenChange: (value: string) => void;
  onTxtSelected: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function AccountImportTokenPanel({
  tokenInput,
  tokenCount,
  isSubmitting,
  txtInputRef,
  onBack,
  onTokenChange,
  onTxtSelected,
}: AccountImportTokenPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <AccountImportBackButton onClick={onBack} />
        <span className="text-xs text-muted-foreground">当前识别 {tokenCount} 个 Token</span>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Access Token 列表</label>
        <Textarea
          placeholder="每行一个 Access Token..."
          value={tokenInput}
          onChange={(event) => onTokenChange(event.target.value)}
          className="min-h-56 resize-none rounded-xl border-border"
        />
      </div>
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">从 TXT 文件导入</div>
            <div className="text-sm leading-6 text-muted-foreground">支持 `.txt`，文件内容也是一行一个 Token。</div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg border-border bg-background"
            onClick={() => txtInputRef.current?.click()}
            disabled={isSubmitting}
          >
            <FileText className="size-4" />
            选择 TXT
          </Button>
        </div>
      </div>
      <input
        ref={txtInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(event) => onTxtSelected(event)}
      />
    </div>
  );
}