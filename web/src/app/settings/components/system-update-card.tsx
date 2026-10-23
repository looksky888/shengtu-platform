"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestError } from "@/lib/request";
import {
  checkSystemUpdates,
  fetchSystemVersion,
  type HostUpdaterStatus,
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

function formatVersionTag(version?: string) {
  const clean = (version || "").trim();
  if (!clean) return "—";
  return clean.startsWith("v") || clean.startsWith("V") ? clean : `v${clean}`;
}

type ParsedReleaseNotes = {
  changelogUrl: string | null;
  blocks: Array<
    | { type: "heading"; text: string }
    | { type: "bullet"; text: string }
    | { type: "paragraph"; text: string }
  >;
};

function stripMarkdownInline(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .trim();
}

function renderInlineCode(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-foreground ring-1 ring-border/70"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function parseReleaseNotes(body?: string): ParsedReleaseNotes {
  if (!body || !body.trim()) {
    return { changelogUrl: null, blocks: [] };
  }

  let changelogUrl: string | null = null;
  const blocks: ParsedReleaseNotes["blocks"] = [];

  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const changelogMatch = trimmed.match(/^\*{0,2}Full Changelog\*{0,2}\s*:\s*(https?:\/\/\S+)/i);
    if (changelogMatch) {
      changelogUrl = changelogMatch[1];
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", text: stripMarkdownInline(headingMatch[1]) });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push({ type: "bullet", text: stripMarkdownInline(bulletMatch[1]) });
      continue;
    }

    blocks.push({ type: "paragraph", text: stripMarkdownInline(trimmed) });
  }

  return { changelogUrl, blocks };
}

function Detail({
  label,
  value,
  mono = false,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/75 bg-surface-muted/30 px-4 py-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div
        className={`mt-1.5 min-w-0 overflow-x-auto scrollbar-none text-xs font-semibold text-foreground sm:text-[13px] ${
          mono ? "font-mono break-keep whitespace-nowrap" : "break-keep"
        }`}
        title={value || undefined}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            <span>{value || "—"}</span>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ) : (
          value || "—"
        )}
      </div>
    </div>
  );
}

export function SystemUpdateCard() {
  const [data, setData] = useState<SystemVersionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [hostUpdater, setHostUpdater] = useState<HostUpdaterStatus | null>(null);

  const handleHostUpdaterChange = useCallback((nextStatus: HostUpdaterStatus | null) => {
    setHostUpdater(nextStatus);
  }, []);

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
        toast.success(updateStatus.has_update ? `发现新版本 ${formatVersionTag(updateStatus.latest_version)}` : "当前已是最新版本");
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
  const parsedNotes = useMemo(
    () => parseReleaseNotes(status?.release_info?.body),
    [status?.release_info?.body],
  );
  const repoHref =
    status?.repository && /^[\w.-]+\/[\w.-]+$/.test(status.repository)
      ? `https://github.com/${status.repository}`
      : undefined;

  return (
    <SettingsCard
      className="md:col-span-2"
      icon={RefreshCw}
      title="系统版本与在线升级"
      description="核对当前构建标识、GitHub 发行日志与宿主机无缝升级通道状态"
      tone="blue"
      meta={status ? <Badge variant={status.has_update ? "warning" : "success"}>{status.has_update ? "发现新版本" : "已是最新"}</Badge> : null}
      action={
        <Button variant="outline" size="sm" onClick={() => void check()} disabled={loading || checking}>
          {checking ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          检查更新
        </Button>
      }
    >
      {loading ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 size-5 animate-spin" />
          正在读取版本信息…
        </div>
      ) : error && !data ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>重新加载</Button>
        </div>
      ) : data && status ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Detail label="当前运行版本" value={formatVersionTag(status.current_version)} mono />
            <Detail label="最新发布版本" value={formatVersionTag(status.latest_version)} mono />
            <Detail label="部署形态" value={`${status.deployment} / ${status.build_type}`} mono />
            <Detail label="发行仓库" value={status.repository} mono href={repoHref} />
          </div>

          {error || status.warning ? (
            <SettingsNotice className="border-status-warning/30 bg-status-warning-soft/55 text-foreground">
              {error || status.warning}
            </SettingsNotice>
          ) : null}

          <div className="rounded-xl border border-border/75 bg-surface-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {status.release_info?.name || formatVersionTag(status.latest_version)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  发布时间：{formatDate(status.release_info?.published_at)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {parsedNotes.changelogUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={parsedNotes.changelogUrl} target="_blank" rel="noreferrer">
                      查看完整 GitHub 变更对比
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                {status.release_info?.html_url ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={status.release_info.html_url} target="_blank" rel="noreferrer">
                      查看 Release
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="thin-scrollbar mt-3.5 max-h-60 space-y-2 overflow-y-auto pr-1 text-xs leading-6 text-muted-foreground sm:text-[13px]">
              {parsedNotes.blocks.length === 0 ? (
                <p>当前发行版暂无详细更新说明。</p>
              ) : (
                parsedNotes.blocks.map((block, index) => {
                  if (block.type === "heading") {
                    return (
                      <div key={index} className="pt-1 text-xs font-semibold tracking-tight text-foreground">
                        {block.text}
                      </div>
                    );
                  }
                  if (block.type === "bullet") {
                    return (
                      <div key={index} className="flex items-start gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                        <span className="min-w-0 break-words">{renderInlineCode(block.text)}</span>
                      </div>
                    );
                  }
                  return (
                    <p key={index} className="break-words">
                      {renderInlineCode(block.text)}
                    </p>
                  );
                })
              )}
            </div>
          </div>

          {hostUpdater?.connected ? (
            <SettingsNotice className="border-status-success/30 bg-status-success-soft/55 text-foreground">
              <div className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full bg-status-success" aria-hidden="true" />
                <span>已连接宿主机无缝更新守护服务（Host Updater），检测到新版本后可一键平滑升级。</span>
              </div>
            </SettingsNotice>
          ) : status.automatic_update_supported ? (
            <SettingsNotice className="border-status-success/30 bg-status-success-soft/55 text-foreground">
              <div className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full bg-status-success" aria-hidden="true" />
                <span>当前部署支持原地二进制更新，执行升级前建议先创建配置备份。</span>
              </div>
            </SettingsNotice>
          ) : null}

          <HostUpdaterStatusPanel onStatusChange={handleHostUpdaterChange} />
        </div>
      ) : null}
    </SettingsCard>
  );
}
