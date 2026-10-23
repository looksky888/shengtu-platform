import { ConfirmDialog } from "@/components/confirm-dialog";

import type { AnnouncementsCardState } from "./use-announcements-card";

export function AnnouncementDeleteDialog({
  state,
}: {
  state: AnnouncementsCardState;
}) {
  const isDeleting = state.deletingItem
    ? state.pendingIds.has(state.deletingItem.id)
    : false;

  return (
    <ConfirmDialog
      open={Boolean(state.deletingItem)}
      destructive
      title="确认删除站内公告？"
      description={
        state.deletingItem
          ? `确认永久删除公告「${state.deletingItem.title || "未命名公告"}」吗？`
          : ""
      }
      impactItems={[
        "删除后该公告将立即从登录页与创作台下线",
        "此操作不可恢复，如需暂时隐藏可使用列表右侧开关停用",
      ]}
      confirmLabel="确认删除"
      pendingLabel="正在删除…"
      pending={isDeleting}
      onClose={() => state.setDeletingItem(null)}
      onConfirm={() => void state.handleDelete()}
    />
  );
}
