import { CloudUpload, Download, KeyRound, LoaderCircle, Plus, Power, PowerOff, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { GrokAccountsController } from "./use-grok-accounts";

export function GrokAccountsToolbar({ controller }: { controller: GrokAccountsController }) {
  const {
    runtimeAvailable, keyword, setKeyword, status, setStatus, loading, busy, selected,
    importOpen, setImportOpen, importText, setImportText, error, setOauthPanelOpen,
    load, handleStartOAuth, handleImport, handleDelete, handleDisable, handleRefreshQuota,
    handleSyncRuntime, handleExport,
  } = controller;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="搜索 Grok 账号" className="h-10 max-w-xs rounded-xl" placeholder="搜索 ID / 邮箱 / 来源" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        <select aria-label="Grok 账号状态筛选" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">全部状态</option>
          <option value="active">可用</option>
          <option value="normal">运行正常</option>
          <option value="limited">限流</option>
          <option value="abnormal">异常</option>
          <option value="disabled">禁用</option>
          <option value="pending_sso">待登录态</option>
        </select>
        <Button variant="outline" className="h-10 rounded-xl" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw className={cn("size-4", loading ? "animate-spin" : "")} />刷新列表
        </Button>
        <Button variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={() => void handleRefreshQuota(selected.length ? selected : undefined)}>
          <RefreshCw className="size-4" />{selected.length ? "刷新选中额度" : "刷新全部额度"}
        </Button>
        <Button variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={() => void handleSyncRuntime()}>
          <CloudUpload className="size-4" />同步入池
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          disabled={busy}
          onClick={() => void handleStartOAuth(selected.length ? selected : undefined)}
          title="对选中/未关联账号启动 xAI CLI OAuth 协议（注册后获取 grok-4.5）"
        >
          <KeyRound className="size-4" />{selected.length ? "获取选中 OAuth" : "获取 OAuth"}
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50"
          disabled={busy}
          onClick={() => setOauthPanelOpen(true)}
          title="完整 OAuth 管理：导入 / 设备码 / 协议 / 测试 / 列表"
        >
          <KeyRound className="size-4" />OAuth 管理
        </Button>
        <Button className="h-10 rounded-xl" onClick={() => setImportOpen((open) => !open)} disabled={busy}>
          <Plus className="size-4" />导入 SSO
        </Button>
        <Button variant="outline" className="h-10 rounded-xl" disabled={busy || selected.length === 0} onClick={() => void handleDisable(true)}>
          <PowerOff className="size-4" />禁用
        </Button>
        <Button variant="outline" className="h-10 rounded-xl" disabled={busy || selected.length === 0} onClick={() => void handleDisable(false)}>
          <Power className="size-4" />启用
        </Button>
        <Button variant="outline" className="h-10 rounded-xl text-rose-600" disabled={busy || selected.length === 0} onClick={() => void handleDelete()}>
          <Trash2 className="size-4" />删除
        </Button>
        <Button variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={() => void handleExport()}>
          <Download className="size-4" />导出
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        对齐 gptGrok2api 号池：池类型、运行状态、额度 A/F/E/H/C（auto/fast/expert/heavy/console）。
        运行时：{runtimeAvailable ? "已连接" : "未连接/不可用"}。
        注册成功后会自动入队 xAI CLI OAuth（需保存密码）；也可点「获取 OAuth」补跑。
        OAuth 关联后才能用 <code className="rounded bg-muted px-1">grok-4.5</code>；未关联时请求会明确失败，请改用 SSO 模型。
        注册入库默认只做轻量登录态探针；完整额度请用「刷新额度」。
      </p>
      {importOpen ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs text-muted-foreground">每行一个 Grok SSO（支持 `sso=...` 或纯 token）</p>
          <Textarea aria-label="Grok SSO 导入内容" className="min-h-28 rounded-xl font-mono text-xs" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={"sso=xxxx\nsso=yyyy"} />
          <div className="mt-2 flex gap-2">
            <Button className="h-9 rounded-xl" disabled={busy} onClick={() => void handleImport()}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}确认导入
            </Button>
            <Button variant="ghost" className="h-9 rounded-xl" onClick={() => setImportOpen(false)}>取消</Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
          <span className="mt-1 block text-xs text-amber-800/80">
            请检查 Grok 服务连接与内部鉴权配置。
          </span>
        </div>
      ) : null}
    </>
  );
}
