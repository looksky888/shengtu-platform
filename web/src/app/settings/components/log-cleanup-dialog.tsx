import { ConfirmDialog } from "@/components/confirm-dialog";

type LogCleanupDialogProps = {
  open: boolean;
  retentionDays: number;
  savedRetentionDays?: number;
  isRetentionDirty?: boolean;
  isCleaning: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function LogCleanupDialog({
  open,
  retentionDays,
  savedRetentionDays,
  isRetentionDirty = false,
  isCleaning,
  onOpenChange,
  onConfirm,
}: LogCleanupDialogProps) {
  const impactItems = [
    isRetentionDirty
      ? `将先按您当前设定的 ${retentionDays} 天保留期执行清理并同步保存（原已保存为 ${savedRetentionDays ?? retentionDays} 天）`
      : `将保留最近 ${retentionDays} 天内的日志记录，永久清理更早的历史条目`,
    "仅清理系统运行与审计日志表，不会删除创作媒体文件、作品库或账号数据",
  ];

  return (
    <ConfirmDialog
      open={open}
      destructive
      title="确认清理过期历史日志？"
      description={
        isRetentionDirty
          ? `检测到您已将保留期限修改为 ${retentionDays} 天但尚未保存，确认后将自动同步保存该保留期并立即执行日志清理。`
          : `系统将按当前 ${retentionDays} 天保留策略清理过期历史日志。`
      }
      impactItems={impactItems}
      confirmLabel={
        isRetentionDirty
          ? `保存并按 ${retentionDays} 天清理`
          : `确认清理（保留 ${retentionDays} 天）`
      }
      pendingLabel="正在清理日志…"
      pending={isCleaning}
      onClose={() => onOpenChange(false)}
      onConfirm={onConfirm}
    />
  );
}
