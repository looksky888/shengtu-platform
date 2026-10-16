import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { resolveLoginChannelState } from "@/lib/icloud-api";

import { LoginStateChip, SectionCard, SectionLoadError } from "./icloud-cards";
import type { ICloudPageController } from "./use-icloud-page";

export function ICloudSessionsPanel({ controller }: { controller: ICloudPageController }) {
  const { busy, sessions, selectedAccountIds, loadErrors, checkSession, toggleAccount } = controller;
  return (
    <SectionCard
      title="Apple 登录态"
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          disabled={busy || sessions.length === 0}
          onClick={() => void checkSession()}
        >
          检测状态
        </Button>
      }
    >
      <SectionLoadError message={loadErrors.sessions} />
      {!loadErrors.sessions && sessions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          还没有登录态，请在右侧完成登录。
        </p>
      ) : sessions.length > 0 ? (
        <ul className="space-y-2.5">
          {sessions.map((session) => {
            const id = String(session.account_id || "");
            const selected = selectedAccountIds.includes(id);
            return (
              <li
                key={id || session.apple_id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-3 transition ${
                  selected
                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                    : "border-border/80 bg-background/60 hover:border-border"
                }`}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected}
                  disabled={!id}
                  onCheckedChange={(checked) => toggleAccount(id, Boolean(checked))}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {session.apple_id || session.account_label || id || "Apple"}
                  </div>
                  {id ? <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{id}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <LoginStateChip
                      label="新接口"
                      state={resolveLoginChannelState(
                        typeof session.apple_account_login_state === "string" ? session.apple_account_login_state : undefined,
                        Boolean(session.apple_account_login_saved),
                        Boolean(session.apple_account_login_checked),
                        session.apple_account_login_ok,
                      )}
                      status={typeof session.apple_account_login_status === "string" ? session.apple_account_login_status : undefined}
                    />
                    <LoginStateChip
                      label="旧接口"
                      state={resolveLoginChannelState(
                        typeof session.icloud_web_login_state === "string" ? session.icloud_web_login_state : undefined,
                        Boolean(session.icloud_web_login_saved),
                        Boolean(session.icloud_web_login_checked),
                        session.icloud_web_login_ok,
                      )}
                      status={typeof session.icloud_web_login_status === "string" ? session.icloud_web_login_status : undefined}
                    />
                    <LoginStateChip
                      label="取码 IMAP"
                      state={resolveLoginChannelState(
                        typeof session.icloud_imap_login_state === "string" ? session.icloud_imap_login_state : undefined,
                        Boolean(session.icloud_imap_login_saved),
                        Boolean(session.icloud_imap_login_checked),
                        session.icloud_imap_login_ok,
                      )}
                      status={typeof session.icloud_imap_login_status === "string" ? session.icloud_imap_login_status : undefined}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </SectionCard>
  );
}
