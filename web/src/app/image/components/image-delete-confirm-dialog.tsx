import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ImageDeleteConfirmTarget =
  | { type: "one"; id: string }
  | { type: "all" }
  | { type: "turn"; conversationId: string; turnId: string; prompt: string };

type ImageDeleteConfirmDialogProps = {
  target: ImageDeleteConfirmTarget | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ImageDeleteConfirmDialog({
  target,
  onCancel,
  onConfirm,
}: ImageDeleteConfirmDialogProps) {
  if (!target) {
    return null;
  }

  const title = target.type === "all" ? "清空历史记录" : target.type === "turn" ? "删除本轮创作记录" : "删除对话";
  const description =
    target.type === "all"
      ? "确认删除全部图片历史记录吗？删除后无法恢复。"
      : target.type === "turn"
        ? "将从当前对话中移除这条提示词及本轮结果展示；图片库和 R2 中已归档的图片不会删除。"
        : "确认删除这条图片对话吗？删除后无法恢复。";
  const promptPreview = target.type === "turn" ? target.prompt.trim().slice(0, 80) : "";

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : null)}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-sm leading-6">{description}</DialogDescription>
          {promptPreview ? (
            <div className="line-clamp-2 rounded-xl border border-border/70 bg-surface-muted px-3 py-2 text-sm leading-6 text-muted-foreground">
              {promptPreview}
              {target.type === "turn" && target.prompt.trim().length > 80 ? "…" : ""}
            </div>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => void onConfirm()}>
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
