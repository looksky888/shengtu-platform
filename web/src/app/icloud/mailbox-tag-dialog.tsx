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
  { value: "slate", label: "灰色", dot: "bg-slate-500" },
  { value: "blue", label: "蓝色", dot: "bg-blue-500" },
  { value: "green", label: "绿色", dot: "bg-emerald-500" },
  { value: "amber", label: "黄色", dot: "bg-amber-500" },
  { value: "red", label: "红色", dot: "bg-rose-500" },
  { value: "violet", label: "紫色", dot: "bg-violet-500" },
];

const tagPresets: Array<{ tag: string; color: ICloudMailboxTagColor }> = [
  { tag: "GPT 已注册", color: "green" },
  { tag: "Grok 已注册", color: "violet" },
  { tag: "待注册", color: "amber" },
  { tag: "备用", color: "blue" },
  { tag: "不可用", color: "red" },
];

const badgeClass: Record<ICloudMailboxTagColor, string> = {
  slate: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  blue: "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  green: "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  amber: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  red: "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  violet: "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
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
      <DialogContent className="max-w-md rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="size-4 text-blue-500" />标记邮箱</DialogTitle>
          <DialogDescription>标记不会被同步覆盖；选择 GPT/Grok 已注册后会归入“已使用”。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tagPresets.map((preset) => (
              <Button key={preset.tag} type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => { setTag(preset.tag); setColor(preset.color); }}>
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
                <button key={item.value} type="button" aria-label={item.label} aria-pressed={color === item.value} className={cn("grid size-9 place-items-center rounded-full border transition", color === item.value ? "border-foreground ring-2 ring-ring/25" : "border-border")} onClick={() => setColor(item.value)}>
                  <span className={cn("size-4 rounded-full", item.dot)} />
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <DialogFooter>
          {mailbox?.tag ? <Button type="button" variant="ghost" onClick={() => setTag("")} disabled={pending}>清除</Button> : null}
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Tag className="size-4" />}保存标记
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
