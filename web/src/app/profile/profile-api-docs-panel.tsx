import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Code2,
  Coins,
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
import {
  buildLiveModelPricingRows,
  resolveProfileApiBaseOrigin,
} from "@/app/profile/profile-api-pricing";
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
import webConfig from "@/constants/common-env";
import {
  fetchCreationPricing,
  fetchModelCatalog,
  type CreationPricing,
} from "@/lib/api";
import type { PublicImageChannelModel } from "@/lib/image-channel-api";
import { cn } from "@/lib/utils";

type ApiDocsCatalogModule = typeof import("@/app/profile/profile-api-docs-catalog");

const FALLBACK_DOC_CATEGORIES: readonly SubNavItem<DocCategory>[] = [
  { value: "all", label: "全部接口" },
  { value: "image", label: "生图与 GIF" },
  { value: "video", label: "生成视频" },
  { value: "chat", label: "对话方式调用" },
  { value: "account", label: "查模型与查积分" },
];

const FALLBACK_CODE_LANGS: readonly SubNavItem<CodeLang>[] = [
  { value: "curl", label: "cURL" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript / Node" },
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
  const [livePricing, setLivePricing] = useState<CreationPricing | null>(null);
  const [channelModels, setChannelModels] = useState<PublicImageChannelModel[] | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void import("@/app/profile/profile-api-docs-catalog").then((mod) => {
      if (active) setCatalogModule(mod);
    });
    void fetchCreationPricing({ signal: controller.signal })
      .then((pricing) => {
        if (active) setLivePricing(pricing);
      })
      .catch(() => undefined);
    void fetchModelCatalog()
      .then((catalog) => {
        if (active) setChannelModels(catalog.image_channel_models ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const origin = resolveProfileApiBaseOrigin(
    webConfig.apiUrl,
    typeof window !== "undefined" ? window.location.origin : "",
  );

  const pricingRows = useMemo(
    () => buildLiveModelPricingRows(livePricing, channelModels),
    [livePricing, channelModels],
  );

  const recommendedModel = useMemo(
    () => (livePricing?.image_default_model || "").trim() || "gpt-image-2.6-flare",
    [livePricing],
  );

  const effectiveKey =
    injectRealKey && activePlaintextKey
      ? activePlaintextKey
      : "sk-你的密钥";

  const endpoints = useMemo(
    () => (catalogModule ? catalogModule.buildEndpoints(origin, effectiveKey) : []),
    [catalogModule, origin, effectiveKey],
  );

  const filteredEndpoints = useMemo(
    () =>
      category === "all"
        ? endpoints
        : endpoints.filter((item) => item.category === category),
    [category, endpoints],
  );

  const docCategories = catalogModule?.DOC_CATEGORIES ?? FALLBACK_DOC_CATEGORIES;
  const codeLangs = catalogModule?.CODE_LANGS ?? FALLBACK_CODE_LANGS;

  return (
    <Card id="profile-api-docs" className="min-w-0 border-border bg-[#fbfdff] dark:bg-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#cfe0ff] bg-[#edf4ff] text-[#1456f0] dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-300">
              <BookOpen className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold">
                  API 接入教程与复制即用代码
                </CardTitle>
                <Badge className="rounded-md border border-[#cfe0ff] bg-[#edf4ff] text-[#1456f0] dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-300">
                  OpenAI 格式直连
                </Badge>
              </div>
              <CardDescription className="mt-0.5">
                大白话讲清楚怎么填地址、怎么选模型、怎么生图和直出 GIF，复制下面代码就能直接跑通
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-1.5 text-xs">
              <KeyRound className="size-3.5 text-[#1456f0] dark:text-sky-400" />
              <span className="text-foreground">代码里自动填入我的密钥</span>
              <Switch
                checked={injectRealKey && Boolean(activePlaintextKey)}
                disabled={!activePlaintextKey}
                onCheckedChange={setInjectRealKey}
                aria-label="代码里自动填入我的密钥"
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

      <CardContent className="min-w-0 space-y-6 pt-5">
        {/* 三步上手 + 真实模型与积分价格表 */}
        <div className="min-w-0 rounded-2xl border border-[#cfe0ff] bg-[#edf4ff]/55 p-4 sm:p-5 dark:border-sky-500/25 dark:bg-sky-950/20">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-[#1456f0] dark:text-sky-400" />
              三步接好 API（新手照着做就行）
            </div>
            <span className="text-xs text-muted-foreground">
              第三方软件渠道类型统一选「OpenAI 兼容」
            </span>
          </div>

          <div className="grid min-w-0 gap-3 lg:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-border/80 bg-[#fbfdff] p-3.5 dark:bg-card">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#1456f0] font-mono text-[11px] text-white">
                  1
                </span>
                复制 API Key 和接口地址
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                请求头里带上{" "}
                <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  Authorization: Bearer sk-你的密钥
                </code>{" "}
                即可，支持直接填进 Cherry Studio、LobeChat、Dify、沉浸式翻译或自己的 Python / Node 代码里。
              </p>
              <div className="mt-2.5 flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border/75 bg-surface-muted/60 px-2.5 py-1.5">
                <code className="min-w-0 truncate font-mono text-[11px] text-foreground">
                  {origin}/v1
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 shrink-0 text-[#1456f0] hover:bg-[#edf4ff] hover:text-[#1048ce] dark:text-sky-300 dark:hover:bg-sky-950/60"
                  onClick={() => onCopy(`${origin}/v1`, "接口地址")}
                >
                  <Copy className="size-3" />
                  复制地址
                </Button>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-border/80 bg-[#fbfdff] p-3.5 lg:col-span-2 dark:bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#1456f0] font-mono text-[11px] text-white">
                    2
                  </span>
                  <span className="min-w-0 break-words">
                    选择模型（不填默认用 <code className="font-mono text-[#1456f0] dark:text-sky-300">{recommendedModel}</code>）
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Coins className="size-3 text-amber-500" />
                  以下模型均可通过 <code className="font-mono">/v1/models</code> 正常获取并调用
                </span>
              </div>

              <div className="mt-2.5 overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/70 bg-surface-muted/60 text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-2.5 py-1.5 font-medium whitespace-nowrap">模型 ID（点击可复制）</th>
                      <th className="px-2.5 py-1.5 font-medium whitespace-nowrap">当前积分</th>
                      <th className="px-2.5 py-1.5 font-medium whitespace-nowrap">适用场景</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {pricingRows.map((row) => {
                      const primaryModelId = row.model.split("/")[0]?.trim() || row.model;
                      return (
                        <tr key={row.model} className="hover:bg-surface-hover/50">
                          <td className="px-2.5 py-1.5 font-mono text-[11.5px] whitespace-nowrap text-foreground">
                            <button
                              type="button"
                              onClick={() => onCopy(primaryModelId, `模型 ${primaryModelId}`)}
                              className="inline-flex flex-wrap items-center gap-1.5 text-left hover:text-[#1456f0] dark:hover:text-sky-300"
                              title={`点击复制 ${primaryModelId}`}
                            >
                              <span className="font-semibold">{row.model}</span>
                              {row.recommended ? (
                                <span className="rounded bg-[#1456f0] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
                                  默认推荐
                                </span>
                              ) : null}
                            </button>
                          </td>
                          <td className="px-2.5 py-1.5 font-mono text-[11px] font-semibold whitespace-nowrap text-amber-700 dark:text-amber-300">
                            {row.price}
                          </td>
                          <td className="px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
                            {row.capabilities}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 break-words text-[11.5px] text-muted-foreground">
                <strong className="font-semibold text-foreground">第 3 步：</strong>
                直接复制下面的请求代码就能运行（已自动填入当前接口地址{" "}
                <code className="font-mono text-foreground">{origin}</code>）。
              </p>
            </div>
          </div>

          {/* 常用客户端怎么填 */}
          <div className="mt-3.5 grid min-w-0 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <ClientConfigCard
              name="Cherry Studio / NextChat"
              baseUrl={origin}
              models="gpt-image-2.6-flare, gpt-5.4"
              note="软件会自动补 /v1，填上面根地址即可；点「获取模型」就能拉出全部新模型"
              onCopy={(val) => onCopy(val, "Cherry Studio 地址")}
            />
            <ClientConfigCard
              name="LobeChat / OpenWebUI"
              baseUrl={`${origin}/v1`}
              models="gpt-image-2.6-flare, grok-imagine-image"
              note="在「OpenAI 服务商」里填带 /v1 的代理地址和 sk- 密钥"
              onCopy={(val) => onCopy(val, "LobeChat 地址")}
            />
            <ClientConfigCard
              name="Dify / n8n / Coze 工作流"
              baseUrl={`${origin}/v1`}
              models="gpt-image-2.6-flare, grok-imagine-video"
              note="HTTP 节点请求头加 Authorization: Bearer sk-你的密钥"
              onCopy={(val) => onCopy(val, "工作流地址")}
            />
            <ClientConfigCard
              name="Python / Node 自己的代码"
              baseUrl={`${origin}/v1`}
              models="gpt-image-2.6-flare（支持 output_format: gif）"
              note="直接兼容官方 openai 库，或用下面现成的 requests / fetch 代码"
              onCopy={(val) => onCopy(val, "SDK Base URL")}
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

        {/* 常见报错排查 */}
        <div className="rounded-2xl border border-border bg-surface-muted/35 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldAlert className="size-4 text-amber-500" />
              常见报错排查（遇到报错先看这里）
            </div>
            <span className="text-xs text-muted-foreground">
              生成失败不扣分：若上游超时或异常失败，系统会自动把预扣积分退回账号
            </span>
          </div>
          <div className="grid min-w-0 gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <StatusNote
              code="401 密钥无效或未带前缀"
              desc="检查请求头是不是写成了 Authorization: Bearer sk-xxx（注意 Bearer 后面有个空格），或者密钥是不是已经被暂停 / 重新生成过。"
            />
            <StatusNote
              code="402 积分余额不足"
              desc="当前账号剩余积分不够生成本次图片或视频，去「积分中心与流水」签个到或用兑换码充一点积分就能继续用。"
            />
            <StatusNote
              code="400 参数不匹配（常见于 GIF）"
              desc="生成 GIF 时误用了非 2.6 系列模型，或者同时开了流式 stream: true。改成 model: gpt-image-2.6-flare 并关掉 stream 即可。"
            />
            <StatusNote
              code="429 请求太快触发限流"
              desc="超过了每分钟请求次数（RPM）或同时生成的并发上限，代码里稍微等几秒重试即可。"
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
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-border/80 bg-[#fbfdff] p-3 dark:bg-card">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-6 px-2 text-[#1456f0] hover:bg-[#edf4ff] hover:text-[#1048ce] dark:text-sky-300 dark:hover:bg-sky-950/60"
            onClick={() => onCopy(baseUrl)}
          >
            <Copy className="size-3" />
            复制
          </Button>
        </div>
        <code className="mt-1 block truncate rounded-md bg-surface-muted px-2 py-1 font-mono text-[11px] text-foreground">
          {baseUrl}
        </code>
      </div>
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        <div className="truncate">
          <strong className="font-medium text-foreground">可用模型：</strong>
          {models}
        </div>
        <p className="line-clamp-2 leading-relaxed">{note}</p>
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
  const presets = endpoint.presets ?? [];
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    presets[0]?.id ?? "",
  );

  const activePreset =
    presets.find((item) => item.id === selectedPresetId) ?? presets[0] ?? null;

  const code = activePreset
    ? activePreset.snippets[lang]
    : endpoint.snippets[lang];
  const responseExample = activePreset
    ? activePreset.responseExample
    : endpoint.responseExample;

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-[#fbfdff] shadow-2xs dark:bg-card">
      <div className="flex flex-col gap-2 border-b border-border/70 bg-[#f4f7fc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:bg-muted/40">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-xs font-semibold",
              endpoint.method === "GET" &&
                "bg-[#edf4ff] text-[#1456f0] ring-1 ring-[#cfe0ff] dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-500/30",
              endpoint.method === "POST" &&
                "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300",
              endpoint.method === "DELETE" &&
                "bg-rose-500/12 text-rose-700 ring-1 ring-rose-500/25 dark:text-rose-300",
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

      <div className="min-w-0 space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {endpoint.summary}
        </p>

        {endpoint.params && endpoint.params.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border/75">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/70 bg-surface-muted/50 text-[11px] font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">参数名</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">是否必填</th>
                  <th className="px-3 py-2 font-medium">不填默认</th>
                  <th className="px-3 py-2 font-medium">大白话说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {endpoint.params.map((param) => (
                  <tr key={param.name} className="transition-colors hover:bg-surface-hover/50">
                    <td className="px-3 py-2 font-mono font-medium whitespace-nowrap text-foreground">
                      {param.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                      {param.type}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {param.required ? (
                        <span className="font-semibold text-[#1456f0] dark:text-sky-300">
                          必填
                        </span>
                      ) : (
                        <span className="text-muted-foreground">选填</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
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

        {presets.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cfe0ff] bg-[#edf4ff]/60 px-3 py-2 dark:border-sky-500/25 dark:bg-sky-950/25">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                选择示例场景：
              </span>
              {presets.map((preset) => {
                const active = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-all",
                      active
                        ? "bg-[#1456f0] font-semibold text-white shadow-2xs"
                        : "bg-[#fbfdff] font-medium text-foreground/80 ring-1 ring-border hover:text-foreground dark:bg-card",
                    )}
                  >
                    <span>{preset.label}</span>
                    {preset.badge ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px]",
                          active
                            ? "bg-white/20 text-white"
                            : "bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/70 dark:text-sky-300",
                        )}
                      >
                        {preset.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {activePreset?.note ? (
              <span className="text-[11px] font-medium text-[#1456f0] dark:text-sky-300">
                {activePreset.note}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-3 lg:grid-cols-[1.25fr_0.75fr]">
          {/* 请求代码示例 */}
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] text-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <Terminal className="size-3.5 text-sky-400" />
                <span className="font-medium text-slate-200">请求代码</span>
                <div className="ml-1 flex items-center gap-1">
                  {codeLangs.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onLangChange(item.value)}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] transition-colors",
                        lang === item.value
                          ? "bg-[#1456f0] font-semibold text-white"
                          : "text-slate-400 hover:text-slate-200",
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
                className="h-6 text-slate-200 hover:bg-slate-800 hover:text-white"
                onClick={() =>
                  onCopy(
                    code,
                    `${endpoint.title}${activePreset ? ` (${activePreset.label})` : ""} 代码`,
                  )
                }
              >
                <Copy className="size-3" />
                复制代码
              </Button>
            </div>
            <pre className="thin-scrollbar overflow-x-auto p-3.5 font-mono text-xs leading-5 text-slate-100">
              <code>{code}</code>
            </pre>
          </div>

          {/* 响应示例 */}
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                <Code2 className="size-3.5 text-emerald-400" />
                返回结果示例
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 text-slate-200 hover:bg-slate-800 hover:text-white"
                onClick={() =>
                  onCopy(responseExample, `${endpoint.title} 返回示例`)
                }
              >
                <Copy className="size-3" />
                复制
              </Button>
            </div>
            <pre className="thin-scrollbar overflow-x-auto p-3.5 font-mono text-xs leading-5 text-emerald-300">
              <code>{responseExample}</code>
            </pre>
          </div>
        </div>

        {endpoint.notes && endpoint.notes.length > 0 ? (
          <div className="space-y-1 rounded-xl border border-[#cfe0ff]/80 bg-[#edf4ff]/45 px-3.5 py-2.5 text-xs text-foreground dark:border-sky-500/20 dark:bg-sky-950/20">
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
    <div className="min-w-0 rounded-xl border border-border/80 bg-[#fbfdff] p-3 dark:bg-card">
      <div className="font-mono text-xs font-semibold text-foreground tabular-nums">
        {code}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        {desc}
      </p>
    </div>
  );
}
