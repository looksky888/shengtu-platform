import { ExternalLink, FlaskConical, Import, LoaderCircle, RefreshCw, Smartphone, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { GrokOAuthController } from "./use-grok-oauth-panel";

const STAGE_LABELS: Record<string, string> = {
  queued: "排队",
  bootstrap: "发现协议参数",
  device_code: "创建设备码",
  signin: "建立登录上下文",
  castle: "生成 Castle token",
  turnstile: "求解 Turnstile",
  session: "创建账号会话",
  consent: "读取授权主体",
  approve: "确认 Allow",
  token: "获取 OAuth token",
  models: "探测模型",
  delivery: "投递 OAuth 凭据",
  completed: "完成",
  failed: "失败",
};

export function GrokOAuthConnectors({ controller }: { controller: GrokOAuthController }) {
  const {
    accounts, loading, busy, showImport, setShowImport, credentialText, setCredentialText,
    accessToken, setAccessToken, refreshToken, setRefreshToken, device, protocolJob,
    protocolRunning, test, load, handleStartProtocol, handleStartDevice, handlePollDevice, handleImport,
  } = controller;
  const protocolStatus = String(protocolJob?.status || "pending").toLowerCase();
  const protocolTone = protocolStatus === "authorized" || protocolStatus === "completed"
    ? "success"
    : protocolStatus === "failed" ? "danger" : "secondary";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-8 rounded-lg" disabled={busy || loading} onClick={() => void load()}>
          {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-lg" disabled={busy || !accounts.length} onClick={() => test.setShowTest((visible) => !visible)}>
          <FlaskConical className="size-3.5" />账号测试
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-lg" disabled={busy} onClick={() => setShowImport((visible) => !visible)}>
          <Import className="size-3.5" />导入凭据
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-lg" disabled={busy || protocolRunning} onClick={() => void handleStartDevice()}>
          <Smartphone className="size-3.5" />手动设备码
        </Button>
        <Button size="sm" className="h-8 rounded-lg" disabled={busy || protocolRunning} onClick={() => void handleStartProtocol()}>
          <Zap className="size-3.5" />{protocolRunning ? "协议连接中..." : "一键协议连接"}
        </Button>
      </div>

      {protocolJob ? (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              协议授权 · {STAGE_LABELS[String(protocolJob.stage || "")] || protocolJob.stage || "排队"}
            </span>
            <Badge variant={protocolTone}>{protocolJob.status}</Badge>
          </div>
          {protocolJob.message ? <p className="text-xs text-muted-foreground">{protocolJob.message}</p> : null}
          {protocolJob.error ? <p className="break-words text-xs text-rose-600">{protocolJob.error}</p> : null}
        </div>
      ) : null}

      {device ? (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-sm">{device.user_code}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" onClick={() => window.open(device.verification_uri_complete, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="size-3" />打开授权页
              </Button>
              <Button size="sm" className="h-7 rounded-lg text-xs" disabled={busy} onClick={() => void handlePollDevice()}>
                检查授权
              </Button>
            </div>
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={device.verification_uri_complete}>
            {device.verification_uri_complete}
          </p>
        </div>
      ) : null}

      {showImport ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">CPA OAuth JSON</span>
            <Textarea className="min-h-24 font-mono text-xs" value={credentialText} onChange={(event) => setCredentialText(event.target.value)} placeholder="粘贴 xAI OAuth CPA JSON" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Access Token</span>
              <Textarea className="min-h-16 font-mono text-xs" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Refresh Token</span>
              <Textarea className="min-h-16 font-mono text-xs" value={refreshToken} onChange={(event) => setRefreshToken(event.target.value)} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setShowImport(false)}>取消</Button>
            <Button size="sm" className="h-8 rounded-lg" disabled={busy || !(credentialText.trim() || (accessToken && refreshToken))} onClick={() => void handleImport()}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}导入
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
