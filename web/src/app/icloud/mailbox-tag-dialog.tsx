import { useEffect, useState } from "react";
import { LoaderCircle, Tag } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { icloudApi, type ICloudMailbox, type ICloudMailboxTagColor } from "@/lib/icloud-api";

const tagColors: Array<{ value: ICloudMailboxTagColor; label: string; dot: string }> = [
  { value: "slate", label: "灰色", dot: "bg-zinc-500" },
  { value: "blue", label: "靛青", dot: "bg-indigo-500" },
  { value: "green", label: "绿色", dot: "bg-emerald-500" },
  { value: "amber", label: "黄色", dot: "bg-amber-500" },
  { value: "red", label: "红色", dot: "bg-rose-500" },
  { value: "violet", label: "暗紫", dot: "bg-fuchsia-500" },
];

const tagPresets: Array<{ tag: string; color: ICloudMailboxTagColor }> = [
  { tag: "GPT 已注册", color: "green" },
  { tag: "Grok 已注册", color: "violet" },
  { tag: "待注册", color: "amber" },
  { tag: "备用", color: "blue" },
  { tag: "不可用", color: "red" },
];

const badgeClass: Record<ICloudMailboxTagColor, string> = {
  slate: "border-border bg-surface-muted text-foreground",
  blue: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  red: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  violet: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
};

function tagColor(value?: string): ICloudMailboxTagColor {
  return tagColors.some((item) => item.value === value) ? (value as ICloudMailboxTagColor) : "blue";
}

export function MailboxTagBadge({ mailbox }: { mailbox: ICloudMailbox }) {
  if (!mailbox.tag) return null;
  return <Badge className={badgeClass[tagColor(mailbox.tag_color)]}>{mailbox.tag}</Badge>;
}

export function MailboxTagDialog({
  mailbox,
  onOpenChange,
  onSaved,
}: {
  mailbox: ICloudMailbox | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [tag, setTag] = useState("");
  const [color, setColor] = useState<ICloudMailboxTagColor>("blue");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setTag(mailbox?.tag || "");
    setColor(tagColor(mailbox?.tag_color));
  }, [mailbox]);

  async function save() {
    if (!mailbox?.id) return;
    setPending(true);
    try {
      await icloudApi.setMailboxTag(mailbox.id, { tag: tag.trim(), tag_color: tag.trim() ? color : "" });
      toast.success(tag.trim() ? "邮箱标记已保存" : "邮箱标记已清除");
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存标记失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(mailbox)} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="max-w-md rounded-xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4 text-muted-foreground" />
            标记邮箱
          </DialogTitle>
          <DialogDescription>标记不会被同步覆盖；选择 GPT/Grok 已注册后会归入“已使用”。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tagPresets.map((preset) => (
              <Button
                key={preset.tag}
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-md text-xs"
                onClick={() => {
                  setTag(preset.tag);
                  setColor(preset.color);
                }}
              >
                {preset.tag}
              </Button>
            ))}
          </div>
          <label className="block space-y-2 text-sm font-medium">
            标记文字
            <Input value={tag} maxLength={24} placeholder="例如：客户 A、已绑定、待核验" onChange={(event) => setTag(event.target.value)} />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">标记颜色</legend>
            <div className="flex flex-wrap gap-2">
              {tagColors.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-label={item.label}
                  aria-pressed={color === item.value}
                  className={cn(
                    "grid size-9 place-items-center rounded-lg border transition",
                    color === item.value ? "border-foreground ring-2 ring-foreground/15" : "border-border",
                  )}
                  onClick={() => setColor(item.value)}
                >
                  <span className={cn("size-4 rounded-full", item.dot)} />
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <DialogFooter>
          {mailbox?.tag ? (
            <Button type="button" variant="ghost" onClick={() => setTag("")} disabled={pending}>
              清除
            </Button>
          ) : null}
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Tag className="size-4" />}
            保存标记
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
