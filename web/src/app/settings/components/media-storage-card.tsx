"use client";

import { Database, LoaderCircle, Play, Save, ShieldCheck, TestTube2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useSettingsStore } from "../store";
import { SettingsCard, SettingsNotice, settingsInputClassName, settingsToggleClassName } from "./settings-ui";
import { useMediaStorage } from "./use-media-storage";

export function MediaStorageCard() {
  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);
  const setField = useSettingsStore((state) => state.setMediaStorageField);
  const storage = useMediaStorage(config);

  if (isLoadingConfig || !config || storage.isLoading) {
    return (
      <SettingsCard icon={Database} title="媒体存储" tone="blue">
        <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
      </SettingsCard>
    );
  }

  const provider = config.media_storage_provider === "r2" ? "r2" : "local";
  const progress = storage.migration.total > 0
    ? Math.min(100, Math.round((storage.migration.processed / storage.migration.total) * 100))
    : storage.migration.state === "succeeded" ? 100 : 0;
  const running = storage.migration.state === "running";
  const cleanupRunning = storage.cleanup.state === "running";
  const cleanupProgress = storage.cleanup.total > 0
    ? Math.min(100, Math.round((storage.cleanup.processed / storage.cleanup.total) * 100))
    : storage.cleanup.state === "succeeded" ? 100 : 0;
  const healthOK = storage.health?.status === "ok";
  const restartRequired = storage.activeProvider !== provider;

  return (
    <SettingsCard
      icon={Database}
      title="图片媒体存储"
      tone="blue"
      className="md:col-span-2"
      meta={<Badge variant={restartRequired ? "secondary" : healthOK ? "default" : "secondary"}>{restartRequired ? "需要重启" : healthOK ? "R2 正常" : provider === "local" ? "本地模式" : "待检查"}</Badge>}
      action={
        <Button type="button" className="h-9 rounded-xl" onClick={() => void saveConfigSection(["media_storage_provider", "media_auto_cleanup_enabled", "media_r2_account_id", "media_r2_access_key_id", "media_r2_secret_access_key", "media_r2_bucket", "media_r2_prefix", "media_r2_presign_ttl_seconds"])} disabled={isSavingConfig || running || cleanupRunning}>
          {isSavingConfig ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存配置
        </Button>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="media-storage-provider">当前存储</FieldLabel>
            <Select value={provider} onValueChange={(value) => setField({ media_storage_provider: value, ...(value === "r2" ? { media_auto_cleanup_enabled: false } : {}) })} disabled={running || cleanupRunning}>
              <SelectTrigger id="media-storage-provider" className={settingsInputClassName}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="local">服务器本地</SelectItem><SelectItem value="r2">Cloudflare R2</SelectItem></SelectContent>
            </Select>
          </Field>
          <label className={settingsToggleClassName} htmlFor="media-auto-cleanup">
            <Checkbox id="media-auto-cleanup" checked={Boolean(config.media_auto_cleanup_enabled)} onCheckedChange={(value) => setField({ media_auto_cleanup_enabled: Boolean(value) })} />
            <span className="grid gap-1"><span>清理服务器本地图片</span><span className="text-xs font-normal text-muted-foreground">按图片保留天数执行，不会删除 R2 对象；切换 R2 时自动关闭。</span></span>
          </label>
        </div>

        <div className="grid gap-4 rounded-[18px] border border-border/80 bg-muted/25 p-4 md:grid-cols-2">
          <Field><FieldLabel htmlFor="media-r2-account">Account ID</FieldLabel><Input id="media-r2-account" value={String(config.media_r2_account_id || "")} onChange={(e) => setField({ media_r2_account_id: e.target.value })} className={settingsInputClassName} /></Field>
          <Field><FieldLabel htmlFor="media-r2-bucket">Bucket</FieldLabel><Input id="media-r2-bucket" value={String(config.media_r2_bucket || "")} onChange={(e) => setField({ media_r2_bucket: e.target.value })} className={settingsInputClassName} /></Field>
          <Field><FieldLabel htmlFor="media-r2-access">Access Key ID</FieldLabel><Input id="media-r2-access" value={String(config.media_r2_access_key_id || "")} onChange={(e) => setField({ media_r2_access_key_id: e.target.value })} className={settingsInputClassName} /></Field>
          <Field><FieldLabel htmlFor="media-r2-secret">Secret Access Key{config.media_r2_secret_access_key_configured ? "（已配置）" : ""}</FieldLabel><Input id="media-r2-secret" type="password" value={String(config.media_r2_secret_access_key || "")} onChange={(e) => setField({ media_r2_secret_access_key: e.target.value })} placeholder={config.media_r2_secret_access_key_configured ? "留空表示不修改" : "请输入密钥"} className={settingsInputClassName} /></Field>
          <Field><FieldLabel htmlFor="media-r2-prefix">对象前缀</FieldLabel><Input id="media-r2-prefix" value={String(config.media_r2_prefix || "shengtu-media")} onChange={(e) => setField({ media_r2_prefix: e.target.value })} className={settingsInputClassName} /></Field>
          <Field><FieldLabel htmlFor="media-r2-ttl">临时访问地址有效期（秒）</FieldLabel><Input id="media-r2-ttl" type="number" min={60} max={3600} value={String(config.media_r2_presign_ttl_seconds || 300)} onChange={(e) => setField({ media_r2_presign_ttl_seconds: e.target.value })} className={settingsInputClassName} /></Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void storage.testConnection()} disabled={storage.isTesting || running || cleanupRunning}>
            {storage.isTesting ? <LoaderCircle className="size-4 animate-spin" /> : <TestTube2 className="size-4" />}测试连接
          </Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void storage.startMigration(() => saveConfigSection(["media_storage_provider", "media_auto_cleanup_enabled", "media_r2_account_id", "media_r2_access_key_id", "media_r2_secret_access_key", "media_r2_bucket", "media_r2_prefix", "media_r2_presign_ttl_seconds"]).then(Boolean))} disabled={storage.isStarting || running || cleanupRunning}>
            {storage.isStarting || running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{running ? `迁移中 ${progress}%` : "迁移旧图片"}
          </Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void storage.startCleanup("verify")} disabled={provider !== "r2" || !healthOK || storage.isStartingCleanup || running || cleanupRunning}>
            {cleanupRunning && storage.cleanup.mode === "verify" ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{cleanupRunning && storage.cleanup.mode === "verify" ? `验证中 ${cleanupProgress}%` : "验证 R2 副本"}
          </Button>
          <Button type="button" variant="outline" className="rounded-xl text-rose-600 hover:text-rose-700" onClick={() => {
            if (window.confirm(`将删除 ${storage.cleanup.eligible} 个已通过 R2 校验的本地媒体副本，图片库记录和 R2 文件会保留。是否继续？`)) void storage.startCleanup("delete");
          }} disabled={restartRequired || storage.cleanup.state !== "succeeded" || storage.cleanup.mode !== "verify" || storage.cleanup.eligible < 1 || !storage.cleanup.confirmation_token || storage.isStartingCleanup || running || cleanupRunning}>
            {cleanupRunning && storage.cleanup.mode === "delete" ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{cleanupRunning && storage.cleanup.mode === "delete" ? `清理中 ${cleanupProgress}%` : "清理已验证副本"}
          </Button>
        </div>

        {storage.migration.state !== "idle" ? (
          <div className="grid gap-2 rounded-[16px] border border-border/70 bg-background p-4">
            <div className="flex justify-between text-sm"><span>迁移进度</span><span>{storage.migration.processed} / {storage.migration.total}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#1456f0] transition-[width]" style={{ width: `${progress}%` }} /></div>
            <div className="text-xs text-muted-foreground">已迁移 {storage.migration.migrated}，跳过 {storage.migration.skipped}，待重试 {storage.migration.pending}，失败 {storage.migration.failed}</div>
          </div>
        ) : null}

        {storage.cleanup.state !== "idle" ? (
          <div className={`grid gap-2 rounded-[16px] border p-4 ${storage.cleanup.failed > 0 || storage.cleanup.state === "failed" ? "border-amber-200 bg-amber-50/60" : "border-emerald-200/70 bg-emerald-50/40"}`}>
            <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{storage.cleanup.mode === "delete" ? "本地副本清理" : "R2 副本验证"}</span><span className="font-mono tabular-nums">{storage.cleanup.processed} / {storage.cleanup.total}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-[#1456f0] transition-[width]" style={{ width: `${cleanupProgress}%` }} /></div>
            <div className="text-xs text-muted-foreground">通过 {storage.cleanup.verified}，可清理 {storage.cleanup.eligible}，跳过 {storage.cleanup.skipped}，异常 {storage.cleanup.failed}；{storage.cleanup.mode === "delete" ? `已释放 ${formatBytes(storage.cleanup.freed_bytes)}` : `预计释放 ${formatBytes(storage.cleanup.reclaimable_bytes)}`}</div>
            {storage.cleanup.error ? <div className="break-all text-xs text-amber-800">最后异常：{storage.cleanup.error}</div> : null}
          </div>
        ) : null}

        {restartRequired ? (
          <SettingsNotice>已保存的存储方式与当前运行方式不一致。请先重启主应用使 R2 生效；重启前已禁止清理本地副本。</SettingsNotice>
        ) : (
          <SettingsNotice>建议保持“服务器本地”，保存并测试 R2，完成旧图片迁移后再切换为 R2。需要释放服务器空间时，先执行“验证 R2 副本”，确认通过数量后再清理；图片库记录和 R2 对象不会被删除。</SettingsNotice>
        )}
      </div>
    </SettingsCard>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
