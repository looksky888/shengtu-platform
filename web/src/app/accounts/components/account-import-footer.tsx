import { LoaderCircle } from "lucide-react";

import type { ImportMethod, PendingCpaImport } from "@/app/accounts/components/account-import-types";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AccountImportFooterProps = {
  method: ImportMethod;
  disabled: boolean;
  pendingCpaImport: PendingCpaImport | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onImportToken: () => void;
  onImportSession: () => void;
  onOpenConfirm: () => void;
};

export function AccountImportFooter({
  method,
  disabled,
  pendingCpaImport,
  isSubmitting,
  onCancel,
  onImportToken,
  onImportSession,
  onOpenConfirm,
}: AccountImportFooterProps) {
  return (
    <DialogFooter className="pt-2">
      <Button
        variant="secondary"
        className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
        onClick={onCancel}
        disabled={disabled}
      >
        取消
      </Button>
      {method === "token" ? <SubmitButton disabled={disabled} isSubmitting={isSubmitting} onClick={onImportToken}>导入 Token</SubmitButton> : null}
      {method === "session" ? <SubmitButton disabled={disabled} isSubmitting={isSubmitting} onClick={onImportSession}>导入 JSON</SubmitButton> : null}
      {method === "cpa" ? (
        <Button
          className={cn("h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800", !pendingCpaImport ? "hidden" : "")}
          onClick={onOpenConfirm}
          disabled={disabled || !pendingCpaImport}
        >
          查看导入确认
        </Button>
      ) : null}
    </DialogFooter>
  );
}

function SubmitButton({ children, disabled, isSubmitting, onClick }: { children: string; disabled: boolean; isSubmitting: boolean; onClick: () => void }) {
  return (
    <Button className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800" onClick={onClick} disabled={disabled}>
      {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}