import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Code2,
  Copy,
  KeyRound,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  Terminal,
} from "lucide-react";

import type {
  CodeLang,
  DocCategory,
  EndpointDoc,
} from "@/app/profile/profile-api-docs-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ApiDocsCatalogModule = typeof import("@/app/profile/profile-api-docs-catalog");

const FALLBACK_DOC_CATEGORIES: readonly SubNavItem<DocCategory>[] = [
  { value: "all", label: "全部接口" },
  { value: "image", label: "图片生成" },
  { value: "video", label: "异步视频" },
  { value: "chat", label: "对话与模型" },
];

const FALLBACK_CODE_LANGS: readonly SubNavItem<CodeLang>[] = [
  { value: "curl", label: "cURL" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JS / TS" },
];

export function ProfileApiDocsPanel({
  activePlaintextKey,
  onCopy,
}: {
  activePlaintextKey: string;
  onCopy: (value: string, label?: string) => void;
}) {
  const [category, setCategory] = useState<DocCategory>("all");
  const [lang, setLang] = useState<CodeLang>("curl");
  const [injectRealKey, setInjectRealKey] = useState(true);
  const [catalogModule, setCatalogModule] = useState<ApiDocsCatalogModule | null>(null);

  useEffect(() => {
    let active = true;
    void import("@/app/profile/profile-api-docs-catalog").then((mod) => {
      if (active) setCatalogModule(mod);
    });
    return () => {
      active = false;
    };
  }, []);

  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://your-domain.example.com";

  const effectiveKey =
    injectRealKey && activePlaintextKey
      ? activePlaintextKey
      : "sk-YOUR_API_KEY";

  const endpoints = useMemo(
    () => (catalogModule ? catalogModule.buildEndpoints(origin, effectiveKey) : []),
    [catalogModule, origin, effectiveKey]
  );

  const filteredEndpoints = useMemo(
    () =>
      category === "all"
        ? endpoints
        : endpoints.filter((item) => item.category === category),
    [category, endpoints]
  );

  const docCategories = catalogModule?.DOC_CATEGORIES ?? FALLBACK_DOC_CATEGORIES;
  const codeLangs = catalogModule?.CODE_LANGS ?? FALLBACK_CODE_LANGS;

  return (
    <Card id="profile-api-docs">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted text-foreground">
              <BookOpen className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold">
                  API 接口文档与对接指南
                </CardTitle>
                <Badge variant="info" className="rounded-md">
                  OpenAI / Anthropic 兼容
                </Badge>
              </div>
              <CardDescription className="mt-0.5">
                支持一键复制 cURL / Python / JS 调用代码，可直接对接影策
                (Open-AI-Canvas)、Cherry Studio、LobeChat、Dify 等客户端
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
              <KeyRound className="size-3.5 text-muted-foreground" />
              <span className="text-foreground">代码示例自动填入我的密钥</span>
              <Switch
                checked={injectRealKey && Boolean(activePlaintextKey)}
                disabled={!activePlaintextKey}
                onCheckedChange={setInjectRealKey}
                aria-label="代码示例自动填入我的密钥"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <SubNav
            items={docCategories}
            value={category}
            onValueChange={setCategory}
            variant="pill"
            layoutId="api-docs-category-nav"
          />
          <SubNav
            items={codeLangs}
            value={lang}
            onValueChange={setLang}
            variant="pill"
            size="sm"
            layoutId="api-docs-lang-nav"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* 第三方客户端快速接入速查 */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Sparkles className="size-4 text-muted-foreground" />
              主流 AI 客户端 / 工作流对接配置速查
            </div>
            <span className="text-[11px] text-muted-foreground">
              所有客户端均选择「OpenAI 兼容 (OpenAI-Compatible)」渠道类型
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <ClientConfigCard
              name="影策 (Open-AI-Canvas)"
              baseUrl={`${origin}/v1`}
              models="gpt-image-1, grok-imagine, grok-imagine-video"
              note="生图/改图/异步视频全链路原生兼容"
              onCopy={(val) => onCopy(val, "影策 Base URL")}
            />
            <ClientConfigCard
              name="Cherry Studio / NextChat"
              baseUrl={origin}
              models="gpt-4o, grok-3, gpt-image-1"
              note="如客户端自动拼接 /v1，请填根域名；否则填 /v1"
              onCopy={(val) => onCopy(val, "客户端地址")}
            />
            <ClientConfigCard
              name="LobeChat / OpenWebUI"
              baseUrl={`${origin}/v1`}
              models="gpt-4o, gpt-image-1, grok-imagine"
              note="在「模型服务商 -> OpenAI」中填入代理地址与 API Key"
              onCopy={(val) => onCopy(val, "LobeChat 代理地址")}
            />
            <ClientConfigCard
              name="Dify / n8n / Coze 工作流"
              baseUrl={`${origin}/v1`}
              models="POST /v1/images/generations & /v1/videos"
              note="HTTP 节点添加 Header: Authorization: Bearer sk-..."
              onCopy={(val) => onCopy(val, "工作流 Base URL")}
            />
          </div>
        </div>

        {/* 接口列表 */}
        {!catalogModule ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            <span>正在加载接口代码示例…</span>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredEndpoints.map((ep) => (
              <EndpointDocCard
                key={ep.id}
                endpoint={ep}
                codeLangs={codeLangs}
                lang={lang}
                onLangChange={setLang}
                onCopy={onCopy}
              />
            ))}
          </div>
        )}

        {/* 状态码与错误处理规范 */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-foreground">
            <ShieldAlert className="size-4 text-amber-500" />
            HTTP 状态码、限流与计费退费说明
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <StatusNote
              code="200 OK / 202 Accepted"
              desc="生图/对话同步返回 200；异步视频提交返回 202 Accepted 并附带 task_id。"
            />
            <StatusNote
              code="401 Unauthorized"
              desc="缺少 Authorization / X-API-Key 请求头，或密钥已被禁用、轮换失效。"
            />
            <StatusNote
              code="403 Forbidden"
              desc="当前用户角色未授权该 API 路径，或单次请求超出角色配额限制。"
            />
            <StatusNote
              code="400 / 402 积分不足"
              desc="账户积分余额不足以支付当前分辨率或视频时长，请前往充值中心或签到。"
            />
            <StatusNote
              code="429 Too Many Requests"
              desc="触发 API Key 的 RPM、并发数或每日调用上限，响应头包含 Retry-After: 60。"
            />
            <StatusNote
              code="失败自动退费保障"
              desc="生图或视频任务若因上游超时/异常失败，系统自动原路退还预扣积分。"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClientConfigCard({
  name,
  baseUrl,
  models,
  note,
  onCopy,
}: {
  name: string;
  baseUrl: string;
  models: string;
  note: string;
  onCopy: (val: string) => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/60 bg-background p-3">
      <div>
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onCopy(baseUrl)}
          >
            <Copy className="size-3" />
            复制地址
          </Button>
        </div>
        <code className="mt-1 block truncate rounded bg-surface-muted px-2 py-1 font-mono text-[11px] text-foreground">
          {baseUrl}
        </code>
      </div>
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        <div className="truncate">
          <strong className="font-medium text-foreground">推荐模型：</strong>
          {models}
        </div>
        <p className="line-clamp-2">{note}</p>
      </div>
    </div>
  );
}

function EndpointDocCard({
  endpoint,
  codeLangs,
  lang,
  onLangChange,
  onCopy,
}: {
  endpoint: EndpointDoc;
  codeLangs: readonly SubNavItem<CodeLang>[];
  lang: CodeLang;
  onLangChange: (next: CodeLang) => void;
  onCopy: (value: string, label?: string) => void;
}) {
  const code = endpoint.snippets[lang];

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="flex flex-col gap-2 border-b border-border/70 bg-surface-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-xs font-semibold",
              endpoint.method === "GET" &&
                "bg-surface-muted text-foreground ring-1 ring-border/70",
              endpoint.method === "POST" &&
                "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300",
              endpoint.method === "DELETE" &&
                "bg-rose-500/12 text-rose-700 ring-1 ring-rose-500/20 dark:text-rose-300"
            )}
          >
            {endpoint.method}
          </span>
          <code className="font-mono text-xs font-semibold text-foreground sm:text-sm">
            {endpoint.path}
          </code>
          <span className="text-xs font-medium text-muted-foreground">
            — {endpoint.title}
          </span>
        </div>
        {endpoint.contentType ? (
          <Badge variant="outline" className="w-fit font-mono text-[11px]">
            {endpoint.contentType}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {endpoint.summary}
        </p>

        {endpoint.params && endpoint.params.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/70 bg-surface-muted/45 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">参数名</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">必填</th>
                  <th className="px-3 py-2 font-medium">默认值</th>
                  <th className="px-3 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {endpoint.params.map((param) => (
                  <tr key={param.name} className="transition-colors hover:bg-surface-hover/60">
                    <td className="px-3 py-2 font-mono font-medium text-foreground whitespace-nowrap">
                      {param.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {param.type}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {param.required ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          必填
                        </span>
                      ) : (
                        <span className="text-muted-foreground">可选</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {param.defaultValue ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {param.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
          {/* 请求示例 */}
          <div className="flex flex-col overflow-hidden rounded-lg border border-border/80 bg-zinc-950 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Terminal className="size-3.5 text-zinc-400" />
                <span className="font-medium text-zinc-300">请求代码示例</span>
                <div className="ml-2 flex items-center gap-1">
                  {codeLangs.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onLangChange(item.value)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] transition-colors",
                        lang === item.value
                          ? "bg-white/15 font-semibold text-white"
                          : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={() => onCopy(code, `${endpoint.title} 代码`)}
              >
                <Copy className="size-3" />
                复制代码
              </Button>
            </div>
            <pre className="thin-scrollbar overflow-x-auto p-3 font-mono text-xs leading-5 text-zinc-100">
              <code>{code}</code>
            </pre>
          </div>

          {/* 响应示例 */}
          <div className="flex flex-col overflow-hidden rounded-lg border border-border/80 bg-zinc-950 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                <Code2 className="size-3.5 text-emerald-400" />
                JSON 响应示例
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={() =>
                  onCopy(endpoint.responseExample, `${endpoint.title} 响应示例`)
                }
              >
                <Copy className="size-3" />
                复制
              </Button>
            </div>
            <pre className="thin-scrollbar overflow-x-auto p-3 font-mono text-xs leading-5 text-emerald-300/95">
              <code>{endpoint.responseExample}</code>
            </pre>
          </div>
        </div>

        {endpoint.notes && endpoint.notes.length > 0 ? (
          <div className="rounded-lg border border-border/60 bg-surface-muted/60 px-3 py-2 text-xs text-foreground">
            {endpoint.notes.map((note) => (
              <p key={note}>💡 {note}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusNote({ code, desc }: { code: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface p-2.5">
      <div className="font-mono text-xs font-semibold text-foreground tabular-nums">
        {code}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {desc}
      </p>
    </div>
  );
}
