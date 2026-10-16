import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { icloudApi } from "@/lib/icloud-api";

import { SectionCard } from "./icloud-cards";
import type { ICloudPageController } from "./use-icloud-page";

export function ICloudLoginPanels({ controller }: { controller: ICloudPageController }) {
  const {
    busy, sessions, channel, setChannel, appleId, setAppleId, password, setPassword,
    twoFactorMethod, setTwoFactorMethod, pending, code2fa, setCode2fa, startLogin, submit2fa,
    imapAccountId, setImapAccountId, imapEmail, setImapEmail, imapPassword, setImapPassword,
    saveImap, refreshAll,
  } = controller;
  async function recheckImap() {
    try {
      await icloudApi.checkImapLogin({ account_id: imapAccountId || undefined });
      await refreshAll();
      toast.success("IMAP 检测完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "IMAP 检测失败");
    }
  }
  return (
    <>
      <SectionCard title="添加 Apple 登录态" tone="accent">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">登录通道</span>
          <select
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            value={channel}
            onChange={(event) => setChannel(event.target.value as "apple" | "icloud")}
          >
            <option value="apple">新接口 · Apple Account（创建邮箱）</option>
            <option value="icloud">旧接口 · iCloud Web（同步）</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">验证码方式</span>
          <select
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            value={twoFactorMethod}
            onChange={(event) => setTwoFactorMethod(event.target.value)}
          >
            <option value="trusted_device">受信任设备</option>
            <option value="sms">短信</option>
          </select>
        </label>
        <Input aria-label="Apple ID" className="h-10 rounded-xl" placeholder="Apple ID" value={appleId} onChange={(event) => setAppleId(event.target.value)} />
        <Input aria-label="Apple 密码" className="h-10 rounded-xl" type="password" placeholder="Apple 密码" value={password} onChange={(event) => setPassword(event.target.value)} />
        {pending?.pending_id ? (
          <div className="rounded-xl border border-status-warning/30 bg-status-warning-soft p-3">
            <p className="text-xs font-medium text-status-warning">
              {pending.message || "请输入 6 位验证码"}
            </p>
            <div className="mt-2 flex gap-2">
              <Input aria-label="Apple 两步验证码" className="h-10 w-32 rounded-xl" maxLength={6} value={code2fa} onChange={(event) => setCode2fa(event.target.value)} />
              <Button className="h-10 rounded-xl" disabled={busy || code2fa.length < 6} onClick={() => void submit2fa()}>
                提交 2FA
              </Button>
            </div>
          </div>
        ) : (
          <Button className="h-10 w-full rounded-xl" disabled={busy || !appleId || !password} onClick={() => void startLogin()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            开始登录并等待 2FA
          </Button>
        )}
      </SectionCard>

      <SectionCard title="取码登录（IMAP）">
        {sessions.length > 0 ? (
          <select
            aria-label="IMAP Apple 登录态"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            value={imapAccountId}
            onChange={(event) => setImapAccountId(event.target.value)}
          >
            <option value="">自动匹配账号</option>
            {sessions.map((session) => (
              <option key={session.account_id || session.apple_id} value={String(session.account_id || "")}>
                {session.apple_id || session.account_id}
              </option>
            ))}
          </select>
        ) : null}
        <Input aria-label="IMAP 邮箱账号" className="h-10 rounded-xl" placeholder="name@icloud.com" value={imapEmail} onChange={(event) => setImapEmail(event.target.value)} />
        <Input aria-label="IMAP App 专用密码" className="h-10 rounded-xl" type="password" placeholder="App 专用密码" value={imapPassword} onChange={(event) => setImapPassword(event.target.value)} />
        <div className="flex gap-2">
          <Button className="h-9 rounded-xl" disabled={busy} onClick={() => void saveImap()}>
            保存并检测
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-xl"
            disabled={busy}
            onClick={() => void recheckImap()}
          >
            重新检测
          </Button>
        </div>
      </SectionCard>
    </>
  );
}
