import { useState } from "react";
import { Copy, Download, KeyRound, LoaderCircle, Mail, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { icloudApi, type ICloudMailbox } from "@/lib/icloud-api";

import { DeleteMailboxDialog } from "./delete-mailbox-dialog";
import { SectionCard, SectionLoadError } from "./icloud-cards";
import { ICloudCodeFilter } from "./icloud-code-filter";
import { formatMailboxAPICopyText } from "./icloud-mailbox-copy";
import { ICloudMailboxUsageFilter } from "./icloud-mailbox-usage-filter";
import { MailboxTagBadge, MailboxTagDialog } from "./mailbox-tag-dialog";
import { mailboxTagCardClass } from "./mailbox-tag-style";
import type { ICloudPageController } from "./use-icloud-page";

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("复制失败");
  }
}

async function copyMailboxAPI(mailbox: ICloudMailbox) {
  const text = formatMailboxAPICopyText(mailbox, window.location.origin);
  if (!text) {
    toast.error("邮箱或公共 API 不完整");
    return;
  }
  await copyText(text, "邮箱与 API 已复制");
}

export function ICloudMailboxesPanel({ controller }: { controller: ICloudPageController }) {
  const [taggingMailbox, setTaggingMailbox] = useState<ICloudMailbox | null>(null);
  const [codeKeyword, setCodeKeyword] = useState("auto");
  const {
    busy, mailboxLoading, mailboxes, mailboxSummary, loadErrors, mailboxSearch, setMailboxSearch, mailboxUsage, mailboxPage, mailboxFilteredTotal,
    mailboxTotalPages, codeById, messagesById, expandedId, codeBusyId, msgBusyId,
    deletingMailbox, setDeletingMailbox, isDeletingMailbox, confirmDeleteMailbox,
    refreshMailboxList, searchMailboxes, changeMailboxPage, changeMailboxUsage, syncAll, syncMailbox, fetchCode, toggleMessages,
  } = controller;
  return (
    <SectionCard
      title="隐私邮箱与取件"
      action={<Badge variant="info">总库存 {mailboxSummary.total}</Badge>}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ICloudCodeFilter onKeywordChange={setCodeKeyword} />
          <ICloudMailboxUsageFilter
            value={mailboxUsage}
            disabled={mailboxLoading}
            onChange={(usage) => void changeMailboxUsage(usage)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="搜索邮箱或标记"
            className="h-9 w-48 rounded-xl"
            placeholder="搜索邮箱 / 标记"
            value={mailboxSearch}
            onChange={(event) => setMailboxSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && searchMailboxes()}
          />
          <Button size="sm" variant="outline" className="h-9 rounded-xl" disabled={mailboxLoading} onClick={() => void searchMailboxes()}>
            {mailboxLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            搜索
          </Button>
          <Button size="sm" variant="outline" className="h-9 rounded-xl" disabled={busy} onClick={() => void syncAll()}>
            <Download className="size-3.5" />
            同步邮箱
          </Button>
          <Button size="sm" variant="outline" className="h-9 rounded-xl" disabled={mailboxLoading || mailboxPage <= 1} onClick={() => void changeMailboxPage(mailboxPage - 1)}>
            上一页
          </Button>
          <span className="text-xs text-muted-foreground">共 {mailboxFilteredTotal} 个 · 第 {mailboxPage}/{mailboxTotalPages} 页</span>
          <Button size="sm" variant="outline" className="h-9 rounded-xl" disabled={mailboxLoading || mailboxPage >= mailboxTotalPages} onClick={() => void changeMailboxPage(mailboxPage + 1)}>
            下一页
          </Button>
        </div>
      </div>

      <SectionLoadError message={loadErrors.mailboxes} />
      {!loadErrors.mailboxes && mailboxes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          {mailboxUsage === "all" && !mailboxSearch.trim()
            ? "暂无隐私邮箱。请勾选 Apple 账号后点击「创建邮箱」。"
            : "没有符合当前筛选条件的邮箱。"}
        </p>
      ) : mailboxes.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {mailboxes.map((mailbox) => (
            <div key={mailbox.id || mailbox.email} className={`rounded-xl border border-border bg-background p-3 ${mailboxTagCardClass(mailbox)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium">{mailbox.email || "—"}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {mailbox.label || "未命名"} · {mailbox.account_label || mailbox.account_apple_id || "未绑定"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <MailboxTagBadge mailbox={mailbox} />
                  {mailbox.openai_claimed ? (
                    <Badge variant="success">GPT 已注册</Badge>
                  ) : String(mailbox.status || "").toLowerCase() === "used" ? (
                    <Badge variant="warning">GPT 注册中</Badge>
                  ) : !mailbox.tag ? (
                    <Badge variant="secondary">GPT 可用</Badge>
                  ) : null}
                  {mailbox.grok_claimed ? <Badge variant="info">Grok 已注册</Badge> : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={!mailbox.email} onClick={() => void copyText(mailbox.email || "", "邮箱已复制")}>
                  <Copy className="size-3" />复制邮箱
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={!mailbox.email || !mailbox.api_url} onClick={() => void copyMailboxAPI(mailbox)}>
                  <Copy className="size-3" />复制 API
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={!mailbox.id} onClick={() => setTaggingMailbox(mailbox)}>
                  <Tag className="size-3" />标记
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={busy || !mailbox.id} onClick={() => void syncMailbox(mailbox, codeKeyword)}>
                  <Download className="size-3" />同步邮件
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={codeBusyId === mailbox.id || !mailbox.id} onClick={() => void fetchCode(mailbox, codeKeyword)}>
                  <KeyRound className="size-3" />{codeBusyId === mailbox.id ? "取码中…" : "取验证码"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs" disabled={msgBusyId === mailbox.id || !mailbox.id} onClick={() => void toggleMessages(mailbox)}>
                  <Mail className="size-3" />{expandedId === mailbox.id ? "收起邮件" : "查看邮件"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-rose-200/80 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  disabled={busy || isDeletingMailbox || !mailbox.id}
                  onClick={() => setDeletingMailbox(mailbox)}
                >
                  <Trash2 className="size-3" />
                  删除
                </Button>
              </div>
              {codeById[mailbox.id || ""] ? (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">最新验证码</span>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1 font-mono text-lg font-semibold tracking-widest text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                    title="点击复制验证码"
                    onClick={() => void copyText(codeById[mailbox.id || ""], "验证码已复制")}
                  >
                    {codeById[mailbox.id || ""]}
                    <Copy className="size-3.5" />
                  </button>
                </div>
              ) : null}
              {expandedId === mailbox.id ? (
                <div className="mt-3 max-h-40 space-y-2 overflow-auto border-t border-border pt-3">
                  {(messagesById[mailbox.id || ""] || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无同步邮件</p>
                  ) : (
                    (messagesById[mailbox.id || ""] || []).map((message) => (
                      <div key={message.id} className="rounded-md bg-muted/30 p-2 text-xs">
                        <p className="font-medium">{message.subject || "(无主题)"}</p>
                        <p className="mt-1 text-muted-foreground">{message.from || "-"}</p>
                        <p className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap">{message.body || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <DeleteMailboxDialog
        mailbox={deletingMailbox}
        isPending={isDeletingMailbox}
        onOpenChange={(open) => {
          if (!open && !isDeletingMailbox) setDeletingMailbox(null);
        }}
        onDelete={() => void confirmDeleteMailbox()}
      />
      <MailboxTagDialog
        mailbox={taggingMailbox}
        onOpenChange={(open) => !open && setTaggingMailbox(null)}
        onSaved={refreshMailboxList}
      />
    </SectionCard>
  );
}
