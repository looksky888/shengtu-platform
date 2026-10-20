import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { icloudApi } from "@/lib/icloud-api";

import { SectionCard } from "./icloud-cards";
import type { ICloudPageController } from "./use-icloud-page";

const AUTO_IMAP_ACCOUNT = "__auto__";

export function ICloudLoginPanels({
  controller,
}: {
  controller: ICloudPageController;
}) {
  const {
    busy,
    sessions,
    channel,
    setChannel,
    appleId,
    setAppleId,
    password,
    setPassword,
    twoFactorMethod,
    setTwoFactorMethod,
    pending,
    code2fa,
    setCode2fa,
    startLogin,
    submit2fa,
    imapAccountId,
    setImapAccountId,
    imapEmail,
    setImapEmail,
    imapPassword,
    setImapPassword,
    saveImap,
    refreshAll,
  } = controller;

  async function recheckImap() {
    try {
      await icloudApi.checkImapLogin({
        account_id: imapAccountId || undefined,
      });
      await refreshAll();
      toast.success("IMAP 检测完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "IMAP 检测失败");
    }
  }

  return (
    <>
      <SectionCard title="添加 Apple 登录态" tone="accent">
        <div className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">
            登录通道
          </span>
          <Select
            value={channel}
            onValueChange={(value) => setChannel(value as "apple" | "icloud")}
          >
            <SelectTrigger aria-label="登录通道" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apple">
                新接口 · Apple Account（创建邮箱）
              </SelectItem>
              <SelectItem value="icloud">旧接口 · iCloud Web（同步）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="block text-xs">
          <span className="mb-1 block font-medium text-muted-foreground">
            验证码方式
          </span>
          <Select value={twoFactorMethod} onValueChange={setTwoFactorMethod}>
            <SelectTrigger aria-label="验证码方式" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trusted_device">受信任设备</SelectItem>
              <SelectItem value="sms">短信</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          aria-label="Apple ID"
          placeholder="Apple ID"
          value={appleId}
          onChange={(event) => setAppleId(event.target.value)}
        />
        <Input
          aria-label="Apple 密码"
          type="password"
          placeholder="Apple 密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {pending?.pending_id ? (
          <div className="rounded-xl border border-status-warning/30 bg-status-warning-soft p-3">
            <p className="text-xs font-medium text-status-warning">
              {pending.message || "请输入 6 位验证码"}
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                aria-label="Apple 两步验证码"
                className="w-32"
                maxLength={6}
                value={code2fa}
                onChange={(event) => setCode2fa(event.target.value)}
              />
              <Button
                variant="brand"
                loading={busy}
                disabled={busy || code2fa.length < 6}
                onClick={() => void submit2fa()}
              >
                提交 2FA
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="brand"
            loading={busy}
            className="w-full"
            disabled={busy || !appleId || !password}
            onClick={() => void startLogin()}
          >
            开始登录并等待 2FA
          </Button>
        )}
      </SectionCard>

      <SectionCard title="取码登录（IMAP）">
        {sessions.length > 0 ? (
          <Select
            value={imapAccountId || AUTO_IMAP_ACCOUNT}
            onValueChange={(value) =>
              setImapAccountId(value === AUTO_IMAP_ACCOUNT ? "" : value)
            }
          >
            <SelectTrigger aria-label="IMAP Apple 登录态" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_IMAP_ACCOUNT}>自动匹配账号</SelectItem>
              {sessions.map((session) => {
                const val = String(session.account_id || session.apple_id || "");
                if (!val) return null;
                return (
                  <SelectItem key={val} value={val}>
                    {session.apple_id || session.account_id}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : null}
        <Input
          aria-label="IMAP 邮箱账号"
          placeholder="name@icloud.com"
          value={imapEmail}
          onChange={(event) => setImapEmail(event.target.value)}
        />
        <Input
          aria-label="IMAP App 专用密码"
          type="password"
          placeholder="App 专用密码"
          value={imapPassword}
          onChange={(event) => setImapPassword(event.target.value)}
        />
        <div className="flex gap-2">
          <Button
            variant="brand"
            loading={busy}
            disabled={busy}
            onClick={() => void saveImap()}
          >
            保存并检测
          </Button>
          <Button
            variant="outline"
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
