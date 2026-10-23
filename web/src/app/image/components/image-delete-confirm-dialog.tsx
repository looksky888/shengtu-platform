import { ConfirmDialog } from "@/components/confirm-dialog";

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

  const title =
    target.type === "all"
      ? "清空历史记录"
      : target.type === "turn"
        ? "删除本轮创作记录"
        : "确认删除该创作会话？";
  const description =
    target.type === "all"
      ? "确认删除全部图片历史记录吗？删除后无法恢复。"
      : target.type === "turn"
        ? "将从当前对话中移除这条提示词及本轮结果展示；图片库和 R2 中已归档的图片不会删除。"
        : "确认删除这条图片对话吗？删除后无法恢复。";
  const promptPreview = target.type === "turn" ? target.prompt.trim().slice(0, 80) : "";

  return (
    <ConfirmDialog
      open
      title={title}
      description={description}
      impactItems={
        promptPreview
          ? [`${promptPreview}${target.type === "turn" && target.prompt.trim().length > 80 ? "…" : ""}`]
          : undefined
      }
      confirmLabel="确认删除"
      destructive
      onClose={onCancel}
      onConfirm={() => void onConfirm()}
    />
  );
}
