"use client";

import { Archive, LoaderCircle, Play, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsCard, SettingsNotice, settingsInputClassName, settingsToggleClassName } from "./settings-ui";
import { backupStatusText, formatBackupSize, useBackupSettings } from "./use-backup-settings";

const includeOptions = [
  { value: "config", label: "配置文件" },
  { value: "data", label: "数据 JSON" },
  { value: "images", label: "图片文件" },
];

export function BackupSettingsCard() {
  const { config, setConfig, state, isLoading, isSaving, isRunning, updateInclude, save, run } = useBackupSettings();

  return (
    <SettingsCard
      icon={Archive}
      title="备份设置"
      tone="violet"
      meta={<Badge variant={config.enabled ? "success" : "secondary"}>{config.enabled ? "已启用" : "手动"}</Badge>}
      action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void run()} disabled={isLoading || isSaving || isRunning}>
            {isRunning ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Play data-icon="inline-start" />}
            立即备份
          </Button>
          <Button onClick={() => void save()} disabled={isLoading || isSaving || isRunning}>
            {isSaving ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            保存
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-10"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-5">
          <label className={settingsToggleClassName}>
            <Checkbox checked={config.enabled} onCheckedChange={(checked) => setConfig((current) => ({ ...current, enabled: Boolean(checked) }))} />
            启用定时备份配置
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">备份方式</label>
              <Select value={config.provider || "local"} onValueChange={(value) => setConfig((current) => ({ ...current, provider: value }))}>
                <SelectTrigger className={settingsInputClassName}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">本地 ZIP</SelectItem>
                  <SelectItem value="cloudflare_r2">Cloudflare R2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">间隔分钟</label>
              <Input className={settingsInputClassName} value={String(config.interval_minutes)} onChange={(event) => setConfig((current) => ({ ...current, interval_minutes: Number(event.target.value) || 1440 }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">本地备份目录</label>
              <Input className={settingsInputClassName} value={config.local_dir} onChange={(event) => setConfig((current) => ({ ...current, local_dir: event.target.value }))} placeholder="data/backups" />
            </div>
          </div>
          {config.provider === "cloudflare_r2" ? (
            <div className="space-y-3 rounded-lg border border-border/70 bg-surface-muted/40 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><label className="text-sm font-medium">R2 Account ID</label><Input className={settingsInputClassName} value={config.r2_account_id || ""} onChange={(event) => setConfig((current) => ({ ...current, r2_account_id: event.target.value }))} placeholder="Cloudflare 账户 ID" /></div>
                <div className="space-y-2"><label className="text-sm font-medium">R2 Bucket</label><Input className={settingsInputClassName} value={config.r2_bucket || ""} onChange={(event) => setConfig((current) => ({ ...current, r2_bucket: event.target.value }))} placeholder="例如 shengtu-backups" /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Access Key ID</label><Input className={settingsInputClassName} value={config.r2_access_key_id || ""} onChange={(event) => setConfig((current) => ({ ...current, r2_access_key_id: event.target.value }))} /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Secret Access Key</label><Input type="password" className={settingsInputClassName} value={config.r2_secret_access_key || ""} onChange={(event) => setConfig((current) => ({ ...current, r2_secret_access_key: event.target.value }))} /></div>
                <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">对象前缀 Prefix</label><Input className={settingsInputClassName} value={config.r2_prefix || ""} onChange={(event) => setConfig((current) => ({ ...current, r2_prefix: event.target.value }))} placeholder="shengtu-backups" /></div>
              </div>
              <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs leading-5 text-muted-foreground">
                Cloudflare 后台路径：R2 对象存储 → 创建 Bucket → 管理 R2 API 令牌 → 复制 Account ID、Access Key ID、Secret Access Key；令牌权限至少需要目标 Bucket 的对象读写。
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            {includeOptions.map((option) => (
              <label key={option.value} className={settingsToggleClassName}>
                <Checkbox checked={(config.include || []).includes(option.value)} onCheckedChange={(checked) => updateInclude(option.value, Boolean(checked))} />
                {option.label}
              </label>
            ))}
          </div>
          <SettingsNotice>
            状态：{backupStatusText(state)}。最近备份：{state.last_file_name || "—"}；大小 {formatBackupSize(state.last_size)}；文件数 {state.last_file_count || 0}；耗时 {state.last_duration_ms || 0}ms。{state.remote_key ? ` R2：${state.remote_key}` : ""}
            {state.last_error ? <span className="text-rose-600"> 错误：{state.last_error}</span> : null}
          </SettingsNotice>
        </div>
      )}
    </SettingsCard>
  );
}


