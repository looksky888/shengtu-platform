"use client";

import { Megaphone, Plus } from "lucide-react";

import { AnnouncementDialog } from "@/components/announcement-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { AnnouncementDeleteDialog } from "./announcement-delete-dialog";
import { AnnouncementFormDialog } from "./announcement-form-dialog";
import { AnnouncementsList } from "./announcements-list";
import { SettingsCard } from "./settings-ui";
import { useAnnouncementsCard } from "./use-announcements-card";

export function AnnouncementsCard() {
  const state = useAnnouncementsCard();
  const activeCount = state.items.filter((item) => item.enabled).length;
  const isBroadcastPending = state.broadcastingItem
    ? state.pendingIds.has(state.broadcastingItem.id)
    : false;

  return (
    <>
      <SettingsCard
        icon={Megaphone}
        title="站内公告管理"
        description="管理面向登录页与创作工作台的系统通知弹窗，支持即时启停、真实弹窗效果预览及实时全员强制弹窗推送"
        tone="amber"
        meta={
          <Badge
            variant={activeCount > 0 ? "success" : "outline"}
            className="tabular-nums"
          >
            {activeCount} / {state.items.length} 展示中
          </Badge>
        }
        action={
          <Button size="sm" onClick={state.openCreateDialog}>
            <Plus className="size-3.5" />
            发布公告
          </Button>
        }
      >
        <AnnouncementsList state={state} />
      </SettingsCard>

      <AnnouncementFormDialog state={state} />
      <AnnouncementDeleteDialog state={state} />
      <ConfirmDialog
        open={Boolean(state.broadcastingItem)}
        title="确认立即向所有在线用户发起弹窗？"
        description={
          state.broadcastingItem
            ? `即将向所有正在访问对应触达页面的在线用户实时弹出「${state.broadcastingItem.title || "站内公告"}」，已点击过旧版「今日不再提醒」的用户也会立即收到本次弹窗。`
            : ""
        }
        confirmLabel="立即发起全员弹窗"
        pending={isBroadcastPending}
        onClose={() => state.setBroadcastingItem(null)}
        onConfirm={() => void state.handleBroadcast()}
      />
      <AnnouncementDialog
        activeAnnouncement={state.previewItem}
        activeIndex={0}
        totalCount={1}
        autoQueueLength={1}
        onClose={() => state.setPreviewItem(null)}
      />
    </>
  );
}
