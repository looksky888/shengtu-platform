import {
  Ban,
  CheckCircle2,
  Coins,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  Save,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";

import { ApiIntegrationQuickPanel } from "@/app/profile/profile-api-integration-panel";
import { ProfileInfoRow } from "@/app/profile/profile-info-row";
import { formatDateTime, maskKey } from "@/app/profile/profile-utils";
import type { ApiKeyConnectivityResult } from "@/app/profile/use-profile-api-key";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ProfileApiKeyRateLimits, UserKey } from "@/lib/api";

type ProfileApiKeyCardProps = {
  apiKey: UserKey | null;
  rateLimits: ProfileApiKeyRateLimits | null;
  keyName: string;
  isNameDirty: boolean;
  revealedKey: string;
  activePlaintextKey: string;
  justGeneratedKey: string;
  isKeyVisible: boolean;
  rememberLocally: boolean;
  hasKey: boolean;
  isLoadingKey: boolean;
  isSavingName: boolean;
  isToggling: boolean;
  isGenerating: boolean;
  isDeleting: boolean;
  isTesting: boolean;
  testResult: ApiKeyConnectivityResult | null;
  onKeyNameChange: (value: string) => void;
  onSaveName: () => void;
  onReveal: () => void;
  onToggleRememberLocally: (next: boolean) => void;
  onCopy: (value: string, label?: string) => void;
  onToggle: () => void;
  onRotateOpen: () => void;
  onDeleteOpen: () => void;
  onGenerate: () => void;
  onTestConnectivity: () => void;
  onOpenDocs?: () => void;
};

export function ProfileApiKeyCard({
  apiKey,
  rateLimits,
  keyName,
  isNameDirty,
  revealedKey,
  activePlaintextKey,
  justGeneratedKey,
  isKeyVisible,
  rememberLocally,
  hasKey,
  isLoadingKey,
  isSavingName,
  isToggling,
  isGenerating,
  isDeleting,
  isTesting,
  testResult,
  onKeyNameChange,
  onSaveName,
  onReveal,
  onToggleRememberLocally,
  onCopy,
  onToggle,
  onRotateOpen,
  onDeleteOpen,
  onGenerate,
  onTestConnectivity,
}: ProfileApiKeyCardProps) {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://your-domain.example.com";
  const openAIBaseURL = `${origin}/v1`;
  const keyExists = Boolean(apiKey) || hasKey;

  return (
    <Card>
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted text-foreground">
              <KeyRound className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">
                接口密钥（API Key）
              </CardTitle>
              <CardDescription className="truncate">
                兼容 OpenAI / Anthropic 协议与平台生图、视频创作接口
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {apiKey ? (
              <Badge
                variant={apiKey.enabled ? "success" : "danger"}
                className="w-fit rounded-md"
              >
                {apiKey.enabled ? "已启用" : "已禁用"}
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit rounded-md">
                尚未生成
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-5">
        {isLoadingKey ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {justGeneratedKey ? (
              <div className="flex flex-col gap-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-xs text-emerald-950 dark:text-emerald-100">
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
                    新密钥已生成！服务端仅存储加密哈希，请立即复制妥善保管
                  </span>
                  <Badge variant="success" className="rounded-md">
                    明文已就绪
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => onCopy(justGeneratedKey, "API Key")}
                  >
                    <Copy className="size-3.5" />
                    复制 sk- 密钥
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      onCopy(`Bearer ${justGeneratedKey}`, "Bearer Header")
                    }
                  >
                    <Copy className="size-3.5" />
                    复制 Bearer 令牌
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      onCopy(
                        `OPENAI_BASE_URL=${openAIBaseURL}\nOPENAI_API_KEY=${justGeneratedKey}`,
                        ".env 配置"
                      )
                    }
                  >
                    <Copy className="size-3.5" />
                    复制 .env 配置
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid items-stretch gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              {keyExists ? (
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-surface-muted/25 p-4">
                  <div className="flex flex-col gap-3.5">
                    <div className="flex min-h-7 items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <KeyRound className="size-3.5 text-muted-foreground" />
                        凭证管理与安全控制
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {apiKey?.id || "sk-token"}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="profile-api-key-name"
                        className="text-xs font-medium text-foreground"
                      >
                        密钥备注名称
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="profile-api-key-name"
                          value={keyName}
                          onChange={(event) => onKeyNameChange(event.target.value)}
                          placeholder="我的 API 令牌"
                          className="h-9 bg-surface"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 px-3.5"
                          onClick={onSaveName}
                          disabled={!apiKey || !isNameDirty || isSavingName}
                        >
                          {isSavingName ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          保存备注
                        </Button>
                      </div>
                    </div>

                    <BearerTokenBox
                      apiKey={apiKey}
                      revealedKey={revealedKey}
                      activePlaintextKey={activePlaintextKey}
                      isKeyVisible={isKeyVisible}
                      rememberLocally={rememberLocally}
                      hasKey={hasKey}
                      onReveal={onReveal}
                      onToggleRememberLocally={onToggleRememberLocally}
                      onCopy={onCopy}
                    />

                    <div className="grid gap-2 sm:grid-cols-3">
                      <ProfileInfoRow
                        label="密钥 ID"
                        value={apiKey?.id || "—"}
                        code
                      />
                      <ProfileInfoRow
                        label="创建时间"
                        value={formatDateTime(apiKey?.created_at)}
                      />
                      <ProfileInfoRow
                        label="最近调用"
                        value={formatDateTime(apiKey?.last_used_at)}
                      />
                    </div>
                  </div>

                  <ApiKeyActions
                    apiKey={apiKey}
                    isToggling={isToggling}
                    isGenerating={isGenerating}
                    isDeleting={isDeleting}
                    onToggle={onToggle}
                    onRotateOpen={onRotateOpen}
                    onDeleteOpen={onDeleteOpen}
                    onGenerate={onGenerate}
                  />
                </div>
              ) : (
                <ApiKeyOnboardingPanel
                  keyName={keyName}
                  isGenerating={isGenerating}
                  onKeyNameChange={onKeyNameChange}
                  onGenerate={onGenerate}
                />
              )}

              <ApiIntegrationQuickPanel
                apiKey={apiKey}
                rateLimits={rateLimits}
                origin={origin}
                openAIBaseURL={openAIBaseURL}
                isTesting={isTesting}
                testResult={testResult}
                onCopy={onCopy}
                onTestConnectivity={onTestConnectivity}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ApiKeyOnboardingPanel({
  keyName,
  isGenerating,
  onKeyNameChange,
  onGenerate,
}: {
  keyName: string;
  isGenerating: boolean;
  onKeyNameChange: (value: string) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-surface-muted/25 p-4">
      <div className="space-y-4">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <KeyRound className="size-3.5 text-muted-foreground" />
            专属 API 凭证初始化
          </span>
          <Badge variant="outline" className="rounded-md text-[10px]">
            SHA-256 哈希托管
          </Badge>
        </div>

        <div className="rounded-xl border border-border/75 bg-surface p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-foreground bg-foreground text-background">
              <KeyRound className="size-4.5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                尚未生成个人 API 密钥
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                一键签发标准 <code className="font-mono text-foreground">sk-</code> 令牌，即可在自有应用、工作流或第三方客户端中无缝调用平台模型。
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div className="flex items-start gap-2.5 rounded-lg border border-border/65 bg-surface-muted/35 p-2.5">
              <Terminal className="mt-0.5 size-3.5 shrink-0 text-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">
                  兼容 OpenAI Images / Chat SDK
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  原生支持文生图、局部重绘、异步视频与对话协议
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border/65 bg-surface-muted/35 p-2.5">
              <Coins className="mt-0.5 size-3.5 shrink-0 text-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">
                  与当前账户共享算力积分池
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  统一扣费记账，上游任务异常失败自动退还预扣积分
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="profile-api-key-onboarding-name"
            className="text-xs font-medium text-foreground"
          >
            密钥备注名称（可选）
          </label>
          <Input
            id="profile-api-key-onboarding-name"
            value={keyName}
            onChange={(event) => onKeyNameChange(event.target.value)}
            placeholder="例如：影策客户端 / 本地开发脚本"
            className="h-9 bg-surface"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="text-[11px] text-muted-foreground">
          生成后支持随时禁用、轮换或销毁令牌
        </span>
        <Button type="button" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          立即生成专属密钥
        </Button>
      </div>
    </div>
  );
}

function BearerTokenBox({
  apiKey,
  revealedKey,
  activePlaintextKey,
  isKeyVisible,
  rememberLocally,
  hasKey,
  onReveal,
  onToggleRememberLocally,
  onCopy,
}: {
  apiKey: UserKey | null;
  revealedKey: string;
  activePlaintextKey: string;
  isKeyVisible: boolean;
  rememberLocally: boolean;
  hasKey: boolean;
  onReveal: () => void;
  onToggleRememberLocally: (next: boolean) => void;
  onCopy: (value: string, label?: string) => void;
}) {
  const displayValue = revealedKey || maskKey(hasKey, apiKey?.key_hint);
  const canCopyPlaintext = Boolean(activePlaintextKey);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Bearer Token / X-API-Key
        </span>
        <span>
          {canCopyPlaintext
            ? "当前浏览器已缓存明文，可随时复制"
            : hasKey
              ? "服务端仅存哈希，重新生成后可获取新明文"
              : "点击下方按钮生成密钥"}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border/70 bg-surface px-3 py-2 font-mono text-xs text-foreground select-all">
          {displayValue}
        </code>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReveal}
            disabled={!apiKey}
            aria-label={isKeyVisible ? "隐藏密钥" : "查看密钥"}
            title={
              canCopyPlaintext
                ? isKeyVisible
                  ? "隐藏明文"
                  : "显示明文"
                : "查看明文说明"
            }
          >
            {isKeyVisible ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            <span>{isKeyVisible ? "隐藏" : "显示"}</span>
          </Button>
          <Button
            type="button"
            variant={canCopyPlaintext ? "default" : "outline"}
            size="sm"
            onClick={() =>
              activePlaintextKey
                ? onCopy(activePlaintextKey, "API Key")
                : onReveal()
            }
            disabled={!apiKey}
            aria-label="复制密钥"
          >
            <Copy className="size-3.5" />
            <span>复制密钥</span>
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5 text-xs">
        <div className="min-w-0">
          <span className="font-medium text-foreground">
            在当前浏览器记住密钥明文
          </span>
          <p className="text-[11px] text-muted-foreground">
            开启后刷新页面仍可直接复制，并自动填入下方接口文档代码示例
          </p>
        </div>
        <Switch
          checked={rememberLocally}
          onCheckedChange={onToggleRememberLocally}
          aria-label="在当前浏览器记住密钥明文"
        />
      </div>
    </div>
  );
}

function ApiKeyActions({
  apiKey,
  isToggling,
  isGenerating,
  isDeleting,
  onToggle,
  onRotateOpen,
  onDeleteOpen,
  onGenerate,
}: {
  apiKey: UserKey | null;
  isToggling: boolean;
  isGenerating: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onRotateOpen: () => void;
  onDeleteOpen: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
      {apiKey ? (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onToggle}
            disabled={isToggling}
          >
            {isToggling ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : apiKey.enabled ? (
              <Ban className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {apiKey.enabled ? "禁用密钥" : "启用密钥"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onRotateOpen}
            disabled={isGenerating}
          >
            <RotateCcw className="size-4" />
            重新生成（轮换）
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
            onClick={onDeleteOpen}
            disabled={isDeleting}
          >
            <Trash2 className="size-4" />
            删除密钥
          </Button>
        </>
      ) : (
        <Button type="button" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          立即生成接口密钥
        </Button>
      )}
    </div>
  );
}
