import { Ban, CheckCircle2, Copy, Eye, EyeOff, KeyRound, LoaderCircle, RotateCcw, Save, Trash2 } from "lucide-react";

import { ProfileInfoRow } from "@/app/profile/profile-info-row";
import { formatDateTime, maskKey } from "@/app/profile/profile-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { UserKey } from "@/lib/api";

type ProfileApiKeyCardProps = {
  apiKey: UserKey | null;
  keyName: string;
  isNameDirty: boolean;
  revealedKey: string;
  hasKey: boolean;
  isLoadingKey: boolean;
  isSavingName: boolean;
  isRevealing: boolean;
  isToggling: boolean;
  isGenerating: boolean;
  isDeleting: boolean;
  onKeyNameChange: (value: string) => void;
  onSaveName: () => void;
  onReveal: () => void;
  onCopy: (value: string) => void;
  onToggle: () => void;
  onRotateOpen: () => void;
  onDeleteOpen: () => void;
  onGenerate: () => void;
};

export function ProfileApiKeyCard({
  apiKey,
  keyName,
  isNameDirty,
  revealedKey,
  hasKey,
  isLoadingKey,
  isSavingName,
  isRevealing,
  isToggling,
  isGenerating,
  isDeleting,
  onKeyNameChange,
  onSaveName,
  onReveal,
  onCopy,
  onToggle,
  onRotateOpen,
  onDeleteOpen,
  onGenerate,
}: ProfileApiKeyCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300">
              <KeyRound className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">接口密钥</CardTitle>
              <CardDescription className="truncate">{apiKey?.id || "尚未生成"}</CardDescription>
            </div>
          </div>
          {apiKey ? (
            <Badge variant={apiKey.enabled ? "success" : "danger"} className="w-fit rounded-md">{apiKey.enabled ? "已启用" : "已禁用"}</Badge>
          ) : (
            <Badge variant="secondary" className="w-fit rounded-md">未生成</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isLoadingKey ? (
          <div className="flex min-h-[260px] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>
        ) : (
          <>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="profile-api-key-name">密钥名称</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="profile-api-key-name" value={keyName} onChange={(event) => onKeyNameChange(event.target.value)} placeholder="我的 API 令牌" className="h-10 rounded-lg" />
                  <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onSaveName} disabled={!apiKey || !isNameDirty || isSavingName}>
                    {isSavingName ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                    保存
                  </Button>
                </div>
                <FieldDescription>用于区分当前账号的接口调用密钥。</FieldDescription>
              </Field>
            </FieldGroup>
            <BearerTokenBox apiKey={apiKey} revealedKey={revealedKey} hasKey={hasKey} isRevealing={isRevealing} onReveal={onReveal} onCopy={onCopy} />
            <div className="grid gap-3 md:grid-cols-3">
              <ProfileInfoRow label="密钥 ID" value={apiKey?.id || "—"} code />
              <ProfileInfoRow label="创建时间" value={formatDateTime(apiKey?.created_at)} />
              <ProfileInfoRow label="最近使用" value={formatDateTime(apiKey?.last_used_at)} />
            </div>
            <ApiKeyActions apiKey={apiKey} isToggling={isToggling} isGenerating={isGenerating} isDeleting={isDeleting} onToggle={onToggle} onRotateOpen={onRotateOpen} onDeleteOpen={onDeleteOpen} onGenerate={onGenerate} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BearerTokenBox({ apiKey, revealedKey, hasKey, isRevealing, onReveal, onCopy }: { apiKey: UserKey | null; revealedKey: string; hasKey: boolean; isRevealing: boolean; onReveal: () => void; onCopy: (value: string) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Bearer Token</span>
        <span>更新 {formatDateTime(apiKey?.created_at)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-2 font-mono text-sm text-foreground">{revealedKey || maskKey(hasKey)}</code>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="size-9 rounded-lg" onClick={onReveal} disabled={!apiKey || isRevealing} aria-label={revealedKey ? "隐藏密钥" : "查看密钥"} title={revealedKey ? "隐藏" : "查看"}>
            {isRevealing ? <LoaderCircle className="size-4 animate-spin" /> : revealedKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button type="button" variant="outline" size="icon" className="size-9 rounded-lg" onClick={() => (revealedKey ? onCopy(revealedKey) : null)} disabled={!revealedKey} aria-label="复制密钥" title="复制">
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApiKeyActions({ apiKey, isToggling, isGenerating, isDeleting, onToggle, onRotateOpen, onDeleteOpen, onGenerate }: { apiKey: UserKey | null; isToggling: boolean; isGenerating: boolean; isDeleting: boolean; onToggle: () => void; onRotateOpen: () => void; onDeleteOpen: () => void; onGenerate: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {apiKey ? (
        <>
          <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onToggle} disabled={isToggling}>
            {isToggling ? <LoaderCircle className="size-4 animate-spin" /> : apiKey.enabled ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
            {apiKey.enabled ? "禁用" : "启用"}
          </Button>
          <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onRotateOpen} disabled={isGenerating}><RotateCcw className="size-4" />重新生成</Button>
          <Button type="button" variant="outline" className="h-10 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={onDeleteOpen} disabled={isDeleting}><Trash2 className="size-4" />删除</Button>
        </>
      ) : (
        <Button type="button" className="h-10 rounded-lg" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          生成密钥
        </Button>
      )}
    </div>
  );
}
