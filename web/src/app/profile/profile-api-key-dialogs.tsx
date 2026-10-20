import { ConfirmDialog } from "@/components/confirm-dialog";

export type ProfileApiKeyDialogsProps = {
  keyName: string;
  isGenerating: boolean;
  isDeleting: boolean;
  isRotateDialogOpen: boolean;
  isDeleteDialogOpen: boolean;
  onRotateOpenChange: (open: boolean) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onGenerate: () => void;
  onDelete: () => void;
};

export function ProfileApiKeyDialogs({
  keyName,
  isGenerating,
  isDeleting,
  isRotateDialogOpen,
  isDeleteDialogOpen,
  onRotateOpenChange,
  onDeleteOpenChange,
  onGenerate,
  onDelete,
}: ProfileApiKeyDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={isRotateDialogOpen}
        onClose={() => onRotateOpenChange(false)}
        title="重新生成密钥"
        description="重新生成后旧密钥将立即失效，请确认所有外部调用方（SDK、客户端或自动化工作流）已准备好更新为新密钥。"
        confirmLabel="确认重新生成"
        pendingLabel="生成中…"
        tone="warning"
        pending={isGenerating}
        onConfirm={onGenerate}
      />

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onClose={() => onDeleteOpenChange(false)}
        title="删除接口密钥"
        description={`确认删除「${keyName || "我的 API 令牌"}」吗？删除后使用该密钥的所有外部 API 请求将立即被拒绝。`}
        confirmLabel="确认删除"
        pendingLabel="删除中…"
        destructive
        pending={isDeleting}
        onConfirm={onDelete}
      />
    </>
  );
}
