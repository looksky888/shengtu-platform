import { ConfirmDialog } from "@/components/confirm-dialog";
import type { QuarantineItem } from "@/lib/api";

export function QuarantinePurgeDialog({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  item: QuarantineItem | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={Boolean(item)}
      title="删除永久隔离记录？"
      description={
        item
          ? `将从永久隔离仓移除「${item.email || item.token_hash || "该账号"}」。不会重新导入号池，操作不可恢复。`
          : ""
      }
      confirmLabel="确认删除"
      pendingLabel="删除中…"
      destructive
      pending={busy}
      onClose={onCancel}
      onConfirm={onConfirm}
    />
  );
}
