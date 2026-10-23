"use client";

import { Megaphone, Plus } from "lucide-react";

import { AnnouncementDialog } from "@/components/announcement-dialog";
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

  return (
    <>
      <SettingsCard
        icon={Megaphone}
        title="站内公告管理"
        description="管理面向登录页与创作工作台的系统通知弹窗，支持即时启停与真实弹窗效果预览"
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
