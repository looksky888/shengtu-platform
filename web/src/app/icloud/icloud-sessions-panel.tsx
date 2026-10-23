import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
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
          className="h-8 rounded-md"
          disabled={busy || sessions.length === 0}
          onClick={() => void checkSession()}
        >
          检测状态
        </Button>
      }
    >
      <SectionLoadError message={loadErrors.sessions} />
      {!loadErrors.sessions && sessions.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="暂无 Apple 登录态"
          description="请在右侧面板完成 Apple 账号登录与 IMAP 配置。"
          className="rounded-xl border border-dashed border-border/70 bg-surface-muted/25 py-10"
        />
      ) : sessions.length > 0 ? (
        <ul className="space-y-2.5">
          {sessions.map((session) => {
            const id = String(session.account_id || "");
            const selected = selectedAccountIds.includes(id);
            return (
              <li
                key={id || session.apple_id}
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-all ${
                  selected
                    ? "border-foreground bg-surface shadow-xs ring-1 ring-foreground/10"
                    : "border-border/80 bg-surface-muted/25 hover:border-border hover:bg-surface-hover/50"
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
