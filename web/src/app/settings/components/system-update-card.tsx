"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestError } from "@/lib/request";
import {
  checkSystemUpdates,
  fetchSystemVersion,
  type SystemUpdateStatus,
  type SystemVersionResponse,
} from "@/lib/system-update-api";
import { SettingsCard, SettingsNotice } from "./settings-ui";
import { HostUpdaterStatusPanel } from "./host-updater-status";

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-border/70 bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-semibold text-foreground">{value || "—"}</div>
    </div>
  );
}

export function SystemUpdateCard() {
  const [data, setData] = useState<SystemVersionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchSystemVersion(signal));
    } catch (requestError) {
      if (signal?.aborted) return;
      setError(requestError instanceof Error ? requestError.message : "读取版本信息失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const check = async () => {
    setChecking(true);
    try {
      const updateStatus = await checkSystemUpdates();
      setData((current) => current ? { ...current, update_status: updateStatus } : {
        version: updateStatus.current_version,
        version_info: {
          version: updateStatus.current_version,
          commit: "unknown",
          date: "unknown",
          build_type: updateStatus.build_type,
          deployment: updateStatus.deployment,
        },
        update_status: updateStatus,
      });
      setError(updateStatus.warning || "");
      if (updateStatus.warning) {
        toast.error("检查更新未完成，请查看页面提示");
      } else {
        toast.success(updateStatus.has_update ? `发现新版本 ${updateStatus.latest_version}` : "当前已是最新版本");
      }
    } catch (requestError) {
      const message = requestError instanceof RequestError ? requestError.message : "检查更新失败";
      setError(message);
      toast.error(message);
    } finally {
      setChecking(false);
    }
  };

  const status: SystemUpdateStatus | undefined = data?.update_status;
  return (
    <SettingsCard
      className="md:col-span-2"
      icon={RefreshCw}
      title="系统更新"
      tone="blue"
      meta={status ? <Badge variant={status.has_update ? "warning" : "success"}>{status.has_update ? "发现新版本" : "已是最新"}</Badge> : null}
      action={<Button variant="outline" onClick={() => void check()} disabled={loading || checking}>{checking ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}检查更新</Button>}
    >
      {loading ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-5 animate-spin" />正在读取版本信息...</div>
      ) : error && !data ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-rose-600">{error}</p>
          <Button variant="outline" onClick={() => void load()}>重新加载</Button>
        </div>
      ) : data && status ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="当前运行" value={`v${status.current_version}`} />
            <Detail label="最新发布" value={`v${status.latest_version}`} />
            <Detail label="部署方式" value={`${status.deployment} / ${status.build_type}`} />
            <Detail label="更新仓库" value={status.repository} />
          </div>
          {error || status.warning ? <SettingsNotice className="border-amber-200 bg-amber-50 text-amber-800">{error || status.warning}</SettingsNotice> : null}
          <div className="rounded-[18px] border border-border/70 bg-muted/35 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{status.release_info?.name || `v${status.latest_version}`}</div>
                <div className="mt-1 text-xs text-muted-foreground">发布时间：{formatDate(status.release_info?.published_at)}</div>
              </div>
              {status.release_info?.html_url ? <Button asChild size="sm" variant="outline"><a href={status.release_info.html_url} target="_blank" rel="noreferrer">查看 Release<ExternalLink className="size-4" /></a></Button> : null}
            </div>
            <div className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{status.release_info?.body || "当前发行版暂无更新说明。"}</div>
          </div>
          <SettingsNotice className={status.automatic_update_supported ? "border-emerald-200 bg-emerald-50 text-emerald-800" : undefined}>
            <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>{status.automatic_update_supported ? "当前部署支持二进制更新。执行更新前仍应先备份并验证。" : status.support_reason || "当前仅支持检查更新。"}</span></div>
          </SettingsNotice>
          <HostUpdaterStatusPanel />
        </div>
      ) : null}
    </SettingsCard>
  );
}
