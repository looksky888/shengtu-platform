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
        description="生成新密钥后，原来的旧密钥会马上失效。请记得把 Cherry Studio、脚本或其他工具里的旧密钥换成新的。"
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
        description={`确认删除「${keyName || "我的 API 令牌"}」吗？删除后正在用这个密钥的程序或客户端将无法继续调用接口。`}
        confirmLabel="确认删除"
        pendingLabel="删除中…"
        destructive
        pending={isDeleting}
        onConfirm={onDelete}
      />
    </>
  );
}
