import { Activity, Copy, Globe, LoaderCircle, ShieldCheck } from "lucide-react";

import type { ApiKeyConnectivityResult } from "@/app/profile/use-profile-api-key";
import { Button } from "@/components/ui/button";
import type { ProfileApiKeyRateLimits, UserKey } from "@/lib/api";

const PROTOCOL_CAPABILITY_LABELS: Array<{
  perm: string;
  label: string;
  endpoint: string;
}> = [
  { perm: "get/v1/models", label: "查询模型列表", endpoint: "GET /v1/models" },
  {
    perm: "post/v1/images/generations",
    label: "文生图 / GIF 动图",
    endpoint: "POST /v1/images/generations",
  },
  {
    perm: "post/v1/images/edits",
    label: "上传参考图改图",
    endpoint: "POST /v1/images/edits",
  },
  {
    perm: "post/v1/videos",
    label: "生成视频",
    endpoint: "POST /v1/videos",
  },
  {
    perm: "post/v1/chat/completions",
    label: "对话方式生图",
    endpoint: "POST /v1/chat/completions",
  },
  {
    perm: "post/v1/responses",
    label: "Responses 接口",
    endpoint: "POST /v1/responses",
  },
  {
    perm: "post/v1/messages",
    label: "Anthropic 接口",
    endpoint: "POST /v1/messages",
  },
];


export function ApiIntegrationQuickPanel({
  apiKey,
  rateLimits,
  origin,
  openAIBaseURL,
  isTesting,
  testResult,
  onCopy,
  onTestConnectivity,
}: {
  apiKey: UserKey | null;
  rateLimits: ProfileApiKeyRateLimits | null;
  origin: string;
  openAIBaseURL: string;
  isTesting: boolean;
  testResult: ApiKeyConnectivityResult | null;
  onCopy: (value: string, label?: string) => void;
  onTestConnectivity: () => void;
}) {
  const isAdmin = apiKey?.role === "admin" || rateLimits?.unlimited;
  const grantedSet = new Set(
    (apiKey?.api_permissions ?? []).map((p) => p.toLowerCase())
  );
  const availableCapabilities = PROTOCOL_CAPABILITY_LABELS.filter(
    (cap) => isAdmin || grantedSet.size === 0 || grantedSet.has(cap.perm)
  );

  return (
    <div className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-border/70 bg-surface-muted/25 p-4">
      <div className="min-w-0 space-y-3.5">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Globe className="size-3.5 text-[#1456f0] dark:text-sky-400" />
            接口地址与调用限速
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onTestConnectivity}
            disabled={!apiKey || isTesting}
          >
            {isTesting ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Activity className="size-3.5 text-[#1456f0] dark:text-sky-400" />
            )}
            <span>{isTesting ? "测试中…" : "测试密钥能否连通"}</span>
          </Button>
        </div>

        {testResult ? (
          <div
            className={
              testResult.ok
                ? "rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200"
                : "rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-200"
            }
          >
            <div className="flex items-center justify-between gap-2 font-medium">
              <span>{testResult.message}</span>
              <span className="font-mono text-[10px] opacity-75">
                {testResult.testedAt}
              </span>
            </div>
            {testResult.ok &&
            testResult.sampleModels &&
            testResult.sampleModels.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {testResult.sampleModels.map((model) => (
                  <code
                    key={model}
                    className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {model}
                  </code>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <EndpointCopyRow
            label="接口地址 Base URL（带 /v1，大多数 SDK 填这个）"
            value={openAIBaseURL}
            onCopy={() => onCopy(openAIBaseURL, "接口地址 Base URL")}
          />
          <EndpointCopyRow
            label="网站根地址（Cherry Studio 等会自动补 /v1 的填这个）"
            value={origin}
            onCopy={() => onCopy(origin, "网站根地址")}
          />
        </div>

        <div className="grid min-w-0 grid-cols-3 gap-2">
          <RateLimitMiniStat
            label="每分钟请求 (RPM)"
            value={
              isAdmin
                ? "无限制"
                : rateLimits?.rpm_limit
                  ? `${rateLimits.rpm_limit}/min`
                  : "不限"
            }
          />
          <RateLimitMiniStat
            label="最大并发数"
            value={
              isAdmin
                ? "无限制"
                : rateLimits?.concurrent_limit
                  ? `${rateLimits.concurrent_limit} 并发`
                  : "不限"
            }
          />
          <RateLimitMiniStat
            label="每日调用上限"
            value={
              isAdmin
                ? "无限制"
                : rateLimits?.daily_limit
                  ? `${rateLimits.daily_limit}/天`
                  : "不限"
            }
          />
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border/60 pt-2.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-[#1456f0] dark:text-sky-400" />
            当前密钥可用的接口
          </span>
          <span>{apiKey?.role_name || (isAdmin ? "管理员" : "普通用户")}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {availableCapabilities.map((cap) => (
            <span
              key={cap.perm}
              title={cap.endpoint}
              className="rounded-md border border-[#cfe0ff] bg-[#edf4ff] px-2 py-0.5 text-[11px] font-medium text-[#1456f0] dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-200"
            >
              {cap.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function EndpointCopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-1.5 text-xs">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <code className="block truncate font-mono text-xs text-foreground">
          {value}
        </code>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onCopy}
        title={`复制 ${label}`}
        aria-label={`复制 ${label}`}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

function RateLimitMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-surface px-2.5 py-1.5">
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-semibold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}
