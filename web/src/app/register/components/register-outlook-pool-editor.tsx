import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { RegisterCardState } from "./use-register-card";

type RegisterOutlookPoolEditorProps = {
  state: RegisterCardState;
  provider: RegisterCardState["providers"][number];
  index: number;
  disabled?: boolean;
};

export function RegisterOutlookPoolEditor({
  state,
  provider,
  index,
  disabled,
}: RegisterOutlookPoolEditorProps) {
  const stats = (provider.mailboxes_stats || {}) as Record<string, number>;
  const savedCount = Number(provider.mailboxes_count || 0);
  const preview = Array.isArray(provider.mailboxes_preview) ? (provider.mailboxes_preview as string[]) : [];
  const pendingCount = String(provider.mailboxes || "")
    .split(/\r?\n/)
    .filter((line) => line.includes("----") && line.split("----").length >= 4).length;

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between text-sm text-stone-700">
        <span>邮箱池导入 <span className="text-red-400">*</span></span>
        <span className="text-xs text-stone-400">已保存 {savedCount} 个{pendingCount ? ` · 待导入 ${pendingCount} 个` : ""}</span>
      </label>
      <Textarea
        aria-label="Outlook 邮箱池"
        value={String(provider.mailboxes || "")}
        onChange={(event) => state.updateProvider(index, { mailboxes: event.target.value })}
        placeholder={"每行一个邮箱，格式：\n邮箱----密码----client_id----refresh_token\n（本地环境完整回显已保存内容，可直接编辑）"}
        className="min-h-32 rounded-xl border-stone-200 bg-white font-mono text-xs"
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-md bg-stone-100 px-2 py-1 text-stone-600">未使用 {stats.unused ?? 0}</span>
        <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-600">占用中 {stats.in_use ?? 0}</span>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">已用 {stats.used ?? 0}</span>
        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">token失效 {stats.token_invalid ?? 0}</span>
        <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-600">失败 {stats.failed ?? 0}</span>
      </div>
      {preview.length ? (
        <p className="text-xs text-stone-400">
          已保存邮箱：{preview.slice(0, 8).join("、")}
          {preview.length > 8 ? ` 等 ${preview.length} 个` : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="h-8 rounded-lg border-stone-200 bg-white px-3 text-xs text-stone-700" onClick={() => void state.resetOutlookPool("retryable")} disabled={disabled}>
          释放可重试（失败/占用）
        </Button>
        <Button type="button" variant="outline" className="h-8 rounded-lg border-stone-200 bg-white px-3 text-xs text-stone-700" onClick={() => void state.resetOutlookPool("failed")} disabled={disabled}>
          清除失败状态
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-lg border-amber-200 bg-white px-3 text-xs text-amber-700 hover:bg-amber-50"
          onClick={() => {
            if (window.confirm("确定要从 Outlook 邮箱池中删除所有未使用邮箱吗？此操作会移除这些已保存凭据。")) {
              void state.resetOutlookPool("unused");
            }
          }}
          disabled={disabled}
        >
          清空未使用
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-lg border-rose-200 bg-white px-3 text-xs text-rose-600 hover:bg-rose-50"
          onClick={() => {
            if (window.confirm("确定要重置整个 Outlook 邮箱池状态吗？所有邮箱会被标记为可重新使用。")) {
              void state.resetOutlookPool("all");
            }
          }}
          disabled={disabled}
        >
          重置全部状态
        </Button>
      </div>
      <p className="text-xs text-stone-500">
        每个邮箱仅成功注册一次（状态记录在 data/outlook_token_used.json）。
        「释放可重试」对应后端 scope=retryable（失败/占用/临时异常）；成功 used 不会被清。
        可与 iCloud / 临时邮箱多源并存，运行时按启用的 provider 取号。
      </p>
    </div>
  );
}
