import { ConfirmDialog } from "@/components/confirm-dialog";

export function MediaDeleteDialog({
  open,
  mediaLabel,
  count,
  detail,
  isDeleting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  mediaLabel: string;
  count: number;
  detail: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || count <= 0) return null;
  return (
    <ConfirmDialog
      open
      title={`删除${mediaLabel}`}
      description={<>确认删除 {count} 个{mediaLabel}吗？{detail}</>}
      confirmLabel="确认删除"
      pendingLabel="删除中…"
      destructive
      pending={isDeleting}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
