import type { ChangeEvent, RefObject } from "react";

import { AccountImportCpaPanel } from "@/app/accounts/components/account-import-cpa-panel";
import { AccountImportMenu } from "@/app/accounts/components/account-import-menu";
import { AccountImportSessionPanel } from "@/app/accounts/components/account-import-session-panel";
import { AccountImportTokenPanel } from "@/app/accounts/components/account-import-token-panel";
import type { ImportMethod, PendingCpaImport } from "@/app/accounts/components/account-import-types";
import { splitTokens } from "@/app/accounts/components/account-import-utils";

type AccountImportMethodBodyProps = {
  method: ImportMethod;
  tokenInput: string;
  sessionInput: string;
  isSubmitting: boolean;
  pendingCpaImport: PendingCpaImport | null;
  txtInputRef: RefObject<HTMLInputElement | null>;
  cpaInputRef: RefObject<HTMLInputElement | null>;
  onMethodChange: (method: ImportMethod) => void;
  onTokenChange: (value: string) => void;
  onSessionChange: (value: string) => void;
  onTxtSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCpaSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoteCpa: () => void;
};

export function AccountImportMethodBody(props: AccountImportMethodBodyProps) {
  if (props.method === "token") {
    return (
      <AccountImportTokenPanel
        tokenInput={props.tokenInput}
        tokenCount={splitTokens(props.tokenInput).length}
        isSubmitting={props.isSubmitting}
        txtInputRef={props.txtInputRef}
        onBack={() => props.onMethodChange("menu")}
        onTokenChange={props.onTokenChange}
        onTxtSelected={props.onTxtSelected}
      />
    );
  }

  if (props.method === "session") {
    return (
      <AccountImportSessionPanel
        sessionInput={props.sessionInput}
        onBack={() => props.onMethodChange("menu")}
        onSessionChange={props.onSessionChange}
      />
    );
  }

  if (props.method === "cpa") {
    return (
      <AccountImportCpaPanel
        pendingCpaImport={props.pendingCpaImport}
        isSubmitting={props.isSubmitting}
        cpaInputRef={props.cpaInputRef}
        onBack={() => props.onMethodChange("menu")}
        onCpaSelected={props.onCpaSelected}
      />
    );
  }

  return (
    <AccountImportMenu
      onToken={() => props.onMethodChange("token")}
      onSession={() => props.onMethodChange("session")}
      onCpa={() => props.onMethodChange("cpa")}
      onRemoteCpa={props.onRemoteCpa}
    />
  );
}