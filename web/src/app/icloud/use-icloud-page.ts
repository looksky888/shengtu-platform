import { useState } from "react";
import { toast } from "sonner";

import {
  icloudApi,
  type ICloudMailbox,
  type ICloudMessage,
  type ICloudPendingLogin,
} from "@/lib/icloud-api";
import { useICloudAccountSelection } from "./use-icloud-account-selection";
import { useICloudPageData } from "./use-icloud-page-data";
import { useICloudSessionCheck } from "./use-icloud-session-check";

export function useICloudPage(enabled: boolean) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [channel, setChannel] = useState<"apple" | "icloud">("apple");
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorMethod, setTwoFactorMethod] = useState("trusted_device");
  const [pending, setPending] = useState<ICloudPendingLogin | null>(null);
  const [code2fa, setCode2fa] = useState("");
  const [imapAccountId, setImapAccountId] = useState("");
  const [imapEmail, setImapEmail] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [createLabel, setCreateLabel] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [createChannel, setCreateChannel] = useState("");
  const [schedChannel, setSchedChannel] = useState("");
  const [schedInterval, setSchedInterval] = useState(60);
  const [codeById, setCodeById] = useState<Record<string, string>>({});
  const [messagesById, setMessagesById] = useState<Record<string, ICloudMessage[]>>({});
  const [expandedId, setExpandedId] = useState("");
  const [codeBusyId, setCodeBusyId] = useState("");
  const [msgBusyId, setMsgBusyId] = useState("");
  const [deletingMailbox, setDeletingMailbox] = useState<ICloudMailbox | null>(null);
  const [isDeletingMailbox, setIsDeletingMailbox] = useState(false);
  const pageData = useICloudPageData(enabled);
  const {
    loading, sessions, sessionsLoaded, mailboxes, scheduler, setScheduler, loadErrors,
    mailboxPage, changeMailboxPage, refreshAll, refreshFirstMailboxPage, refreshMailboxList,
  } = pageData;
  const { selectedAccountIds, toggleAccount } = useICloudAccountSelection({
    enabled,
    loading,
    sessionsLoaded,
    sessions,
    sessionsError: loadErrors.sessions,
  });

  async function startLogin() {
    if (!appleId || !password) return toast.error("请填写 Apple ID 与密码");
    setBusy(true);
    try {
      const result = await icloudApi.startLogin(channel, {
        apple_id: appleId,
        password,
        two_factor_method: twoFactorMethod,
      });
      if (result.needs_2fa || result.pending_id) {
        setPending(result);
        toast.message(result.message || "请输入 2FA 验证码");
      } else {
        toast.success("登录成功");
        setPassword("");
        setPending(null);
        await refreshAll();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function submit2fa() {
    if (!pending?.pending_id || code2fa.length < 6) return toast.error("请输入 6 位验证码");
    setBusy(true);
    try {
      const result = await icloudApi.submit2fa(channel, { pending_id: pending.pending_id, code: code2fa });
      if (result.needs_2fa) {
        setPending(result);
        toast.message(result.message || "仍需验证");
      } else {
        toast.success("2FA 完成");
        setPending(null);
        setCode2fa("");
        setPassword("");
        await refreshAll();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "2FA 失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveImap() {
    if (!imapEmail || !imapPassword) return toast.error("请填写 iCloud 邮箱与 App 专用密码");
    setBusy(true);
    try {
      const result = await icloudApi.saveImapLogin({
        account_id: imapAccountId || undefined,
        email: imapEmail,
        app_password: imapPassword,
      });
      toast.success(result.message || "IMAP 已保存");
      setImapPassword("");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "IMAP 保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function createMailboxes() {
    if (selectedAccountIds.length === 0) return toast.error("请先勾选 Apple 账号");
    setBusy(true);
    try {
      const result = await icloudApi.createMailboxes({
        account_ids: selectedAccountIds,
        label: createLabel || undefined,
        note: createNote || undefined,
        create_channel: createChannel || undefined,
      });
      toast.success(result.message || "创建完成");
      setNotice("创建成功后注册机 icloud_local 才可 claim。请刷新邮箱列表确认库存。");
      await refreshFirstMailboxPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建邮箱失败");
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setBusy(true);
    try {
      const result = await icloudApi.syncMailboxes({});
      toast.success(result.message || "同步完成");
      await refreshFirstMailboxPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  const checkSession = useICloudSessionCheck({ busy, hasSessions: sessions.length > 0, setBusy, refreshAll });

  async function syncMailbox(mailbox: ICloudMailbox, keyword: string) {
    if (!mailbox.id) return;
    if (!keyword.trim()) return toast.error("请输入自定义平台关键词");
    try {
      const result = await icloudApi.syncMailbox(mailbox.id, keyword);
      toast.success(`已同步${result.synced ? ` ${result.synced} 封验证码邮件` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步邮件失败");
    }
  }

  async function fetchCode(mailbox: ICloudMailbox, keyword: string) {
    if (!mailbox.id) return;
    if (!keyword.trim()) return toast.error("请输入自定义平台关键词");
    setCodeBusyId(mailbox.id);
    try {
      const result = await icloudApi.fetchCode(mailbox.id, keyword);
      if (result.code) {
        setCodeById((current) => ({ ...current, [mailbox.id!]: result.code! }));
        toast.success("已取到验证码");
      } else {
        toast.error(result.message || result.sync_error || "未取到验证码");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取码失败");
    } finally {
      setCodeBusyId("");
    }
  }

  async function toggleMessages(mailbox: ICloudMailbox) {
    if (!mailbox.id) return;
    if (expandedId === mailbox.id) {
      setExpandedId("");
      return;
    }
    setMsgBusyId(mailbox.id);
    try {
      const result = await icloudApi.listMessages(mailbox.id);
      setMessagesById((current) => ({ ...current, [mailbox.id!]: result.messages || [] }));
      setExpandedId(mailbox.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载邮件失败");
    } finally {
      setMsgBusyId("");
    }
  }

  async function confirmDeleteMailbox() {
    const mailbox = deletingMailbox;
    if (!mailbox?.id) return;
    setIsDeletingMailbox(true);
    try {
      await icloudApi.deleteMailbox(mailbox.id);
      toast.success("已删除邮箱");
      setDeletingMailbox(null);
      setCodeById((current) => {
        const next = { ...current };
        delete next[mailbox.id!];
        return next;
      });
      setMessagesById((current) => {
        const next = { ...current };
        delete next[mailbox.id!];
        return next;
      });
      if (expandedId === mailbox.id) setExpandedId("");
      // If last item on page > 1, step back so list is not empty.
      if (mailboxes.length <= 1 && mailboxPage > 1) {
        await changeMailboxPage(mailboxPage - 1);
      } else {
        await refreshMailboxList();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除邮箱失败");
    } finally {
      setIsDeletingMailbox(false);
    }
  }

  async function startScheduler() {
    if (selectedAccountIds.length === 0) return toast.error("请勾选参与定时创建的 Apple 账号");
    setBusy(true);
    try {
      const result = await icloudApi.startScheduler({
        account_ids: selectedAccountIds,
        create_channel: schedChannel || undefined,
        interval_minutes: schedInterval,
        label: createLabel || undefined,
      });
      setScheduler(result.scheduler || null);
      toast.success(result.message || "定时创建已启动");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动失败");
    } finally {
      setBusy(false);
    }
  }

  return {
    ...pageData, busy, selectedAccountIds, notice,
    channel, setChannel, appleId, setAppleId, password, setPassword, twoFactorMethod, setTwoFactorMethod,
    pending, code2fa, setCode2fa, imapAccountId, setImapAccountId, imapEmail, setImapEmail,
    imapPassword, setImapPassword, createLabel, setCreateLabel, createNote, setCreateNote,
    createChannel, setCreateChannel, schedChannel, setSchedChannel,
    schedInterval, setSchedInterval, codeById, messagesById, expandedId, codeBusyId, msgBusyId,
    deletingMailbox, setDeletingMailbox, isDeletingMailbox, confirmDeleteMailbox,
    refreshAll, toggleAccount, startLogin, submit2fa, saveImap, createMailboxes, syncAll,
    checkSession, syncMailbox, fetchCode, toggleMessages, startScheduler,
  };
}

export type ICloudPageController = ReturnType<typeof useICloudPage>;
