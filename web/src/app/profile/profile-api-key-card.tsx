import {
  Ban,
  BookOpen,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  Save,
  Sparkles,
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
  onOpenDocs,
}: ProfileApiKeyCardProps) {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://your-domain.example.com";
  const openAIBaseURL = `${origin}/v1`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-border bg-brand-soft text-brand">
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
                未生成
              </Badge>
            )}
            {onOpenDocs ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenDocs}
              >
                <BookOpen className="size-3.5" />
                查看接口文档
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
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

            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="flex flex-col gap-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="profile-api-key-name">
                      密钥备注名称
                    </FieldLabel>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="profile-api-key-name"
                        value={keyName}
                        onChange={(event) => onKeyNameChange(event.target.value)}
                        placeholder="我的 API 令牌"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onSaveName}
                        disabled={!apiKey || !isNameDirty || isSavingName}
                      >
                        {isSavingName ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        保存
                      </Button>
                    </div>
                    <FieldDescription>
                      用于区分当前账号在日志和任务流水中的接口调用标识。
                    </FieldDescription>
                  </Field>
                </FieldGroup>

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

                <div className="grid gap-2.5 sm:grid-cols-3">
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
          </>
        )}
      </CardContent>
    </Card>
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
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/80 bg-surface-muted/45 p-3.5">
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
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
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
            className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
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
