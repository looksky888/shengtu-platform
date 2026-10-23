"use client";

import { useState } from "react";
import {
  Import,
  LoaderCircle,
  Pencil,
  Plus,
  ServerCog,
  Trash2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CPAPool } from "@/lib/api";

import { useSettingsStore } from "../store";
import {
  SettingsCard,
  SettingsEmptyState,
  SettingsNotice,
  settingsListItemClassName,
} from "./settings-ui";

export function CPAPoolsCard() {
  const pools = useSettingsStore((state) => state.pools);
  const isLoadingPools = useSettingsStore((state) => state.isLoadingPools);
  const deletingId = useSettingsStore((state) => state.deletingId);
  const loadingFilesId = useSettingsStore((state) => state.loadingFilesId);
  const openAddDialog = useSettingsStore((state) => state.openAddDialog);
  const openEditDialog = useSettingsStore((state) => state.openEditDialog);
  const deletePool = useSettingsStore((state) => state.deletePool);
  const browseFiles = useSettingsStore((state) => state.browseFiles);

  const [pendingDeletePool, setPendingDeletePool] = useState<CPAPool | null>(
    null
  );

  const isConfirmDeleting = Boolean(
    pendingDeletePool && deletingId === pendingDeletePool.id
  );

  const handleConfirmDelete = async () => {
    if (!pendingDeletePool) return;
    await deletePool(pendingDeletePool);
    setPendingDeletePool(null);
  };

  return (
    <>
      <SettingsCard
        icon={ServerCog}
        title="CPA 远程号池连接"
        description="连接远程 CLIProxyAPI 管理端，按需拉取账号列表并批量异步导入本地号池"
        tone="slate"
        meta={
          pools.length > 0 ? (
            <Badge variant="outline" className="tabular-nums">
              {pools.length} 个连接
            </Badge>
          ) : null
        }
        action={
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="size-3.5" />
            添加连接
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {isLoadingPools ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : pools.length === 0 ? (
            <SettingsEmptyState
              icon={ServerCog}
              title="暂无 CPA 远程连接"
              description="点击右上角「添加连接」保存 CLIProxyAPI 服务地址与管理密钥，即可随时同步远程账号。"
              action={
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                  <Plus className="size-3.5" />
                  添加第一个连接
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pools.map((pool) => {
                const isDeletingThis = deletingId === pool.id;
                const isLoadingFilesThis = loadingFilesId === pool.id;
                const isBusy = isDeletingThis || isLoadingFilesThis;
                const importJob = pool.import_job ?? null;
                const progress = importJob?.total
                  ? Math.min(
                      100,
                      Math.round((importJob.completed / importJob.total) * 100)
                    )
                  : 0;

                return (
                  <div
                    key={pool.id}
                    className={`flex flex-col justify-between gap-3.5 ${settingsListItemClassName}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {pool.name || "未命名连接"}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              CLIProxyAPI
                            </Badge>
                          </div>
                          <div
                            className="truncate font-mono text-xs text-muted-foreground"
                            title={pool.base_url}
                          >
                            {pool.base_url}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditDialog(pool)}
                            disabled={isBusy}
                            aria-label={`编辑连接 ${pool.name || pool.base_url}`}
                            title="编辑连接"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPendingDeletePool(pool)}
                            disabled={isBusy}
                            aria-label={`删除连接 ${pool.name || pool.base_url}`}
                            title="删除连接"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            {isDeletingThis ? (
                              <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {importJob ? (
                        <div className="rounded-xl border border-border/70 bg-surface p-3 shadow-2xs">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-xs font-medium text-foreground">
                                {importJob.status === "completed"
                                  ? "最近导入已完成"
                                  : importJob.status === "failed"
                                    ? "导入任务异常中止"
                                    : "正在后台导入"}
                                <span className="ml-1.5 font-mono tabular-nums text-muted-foreground">
                                  ({importJob.completed}/{importJob.total})
                                </span>
                              </div>
                              <div className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                                任务 #{importJob.job_id.slice(0, 8)} ·{" "}
                                {importJob.created_at}
                              </div>
                            </div>
                            <Badge
                              variant={
                                importJob.status === "completed"
                                  ? "success"
                                  : importJob.status === "failed"
                                    ? "danger"
                                    : "warning"
                              }
                              className="tabular-nums"
                            >
                              {progress}%
                            </Badge>
                          </div>
                          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-foreground transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                            <span className="text-status-success">
                              新增 {importJob.added}
                            </span>
                            <span>刷新 {importJob.refreshed}</span>
                            <span>跳过 {importJob.skipped}</span>
                            <span
                              className={
                                importJob.failed > 0
                                  ? "font-medium text-status-danger"
                                  : undefined
                              }
                            >
                              失败 {importJob.failed}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-border/55 pt-2.5">
                      <span className="text-[11px] text-muted-foreground">
                        支持搜索筛选并分批勾选导入
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={isLoadingFilesThis}
                        onClick={() => void browseFiles(pool)}
                        disabled={isBusy}
                      >
                        {!isLoadingFilesThis ? (
                          <Import className="size-3.5" />
                        ) : null}
                        浏览并同步账号
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <SettingsNotice>
            <div className="font-medium text-foreground">异步导入工作流说明</div>
            <p className="mt-1 text-muted-foreground">
              点击「浏览并同步账号」先读取远程文件清单；勾选目标账号确认后，由服务端在后台拉取对应凭证并写入本地号池，关闭页面不影响任务继续执行。
            </p>
          </SettingsNotice>
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={Boolean(pendingDeletePool)}
        destructive
        title="确认删除 CPA 远程连接？"
        description={
          pendingDeletePool
            ? `即将移除连接「${pendingDeletePool.name || pendingDeletePool.base_url}」。`
            : ""
        }
        impactItems={[
          "仅删除保存的远程 CLIProxyAPI 连接配置与管理密钥",
          "此前已导入本地号池的账号不会受到影响",
        ]}
        confirmLabel="确认删除"
        pendingLabel="正在删除…"
        pending={isConfirmDeleting}
        onClose={() => setPendingDeletePool(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}
