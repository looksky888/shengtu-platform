import type { ICloudBridgeStatus, ICloudSession } from "@/lib/icloud-api";

type MailboxSummary = { total: number; openAIClaimed: number };

export function createICloudMetrics(
  bridge: ICloudBridgeStatus | null,
  sessions: ICloudSession[],
  mailboxSummary: MailboxSummary,
) {
  const appleOK = sessions.filter((item) => item.apple_account_login_state === "ok").length;
  const webOK = sessions.filter((item) => item.icloud_web_login_state === "ok").length;
  const imapOK = sessions.filter((item) => item.icloud_imap_login_state === "ok").length;
  const allChannelsReady = sessions.length > 0 && appleOK === sessions.length && webOK === sessions.length && imapOK === sessions.length;
  return [
    { label: "Bridge 状态", value: bridge?.reachable ? "可达" : bridge ? "不可达" : "—", detail: "iCloud Sidecar", tone: bridge?.reachable ? "ok" as const : bridge ? "bad" as const : "default" as const },
    { label: "Apple 登录态", value: sessions.length, detail: "已保存账号", tone: sessions.length ? "ok" as const : "default" as const },
    {
      label: "可用通道",
      value: `新${appleOK} / 旧${webOK} / IMAP${imapOK}`,
      detail: allChannelsReady ? "全部账号三通道正常" : "各通道独立判断，请查看账号状态",
      tone: allChannelsReady ? "ok" as const : sessions.length ? "warn" as const : "default" as const,
    },
    { label: "创建邮箱总数", value: mailboxSummary.total, detail: `GPT 已注册 ${mailboxSummary.openAIClaimed}`, tone: mailboxSummary.total ? "ok" as const : "default" as const },
  ];
}
