"use client";

import { Megaphone, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { AnnouncementDeleteDialog } from "./announcement-delete-dialog";
import { AnnouncementFormDialog } from "./announcement-form-dialog";
import { AnnouncementsList } from "./announcements-list";
import { SettingsCard } from "./settings-ui";
import { useAnnouncementsCard } from "./use-announcements-card";

export function AnnouncementsCard() {
  const state = useAnnouncementsCard();

  return (
    <>
      <SettingsCard
        icon={Megaphone}
        title="公告管理"
        tone="amber"
        meta={<span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{state.items.filter((item) => item.enabled).length} / {state.items.length} 已启用</span>}
        action={
          <Button onClick={state.openCreateDialog}>
            <Plus data-icon="inline-start" />
            添加公告
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <AnnouncementsList state={state} />
        </div>
      </SettingsCard>
      <AnnouncementFormDialog state={state} />
      <AnnouncementDeleteDialog state={state} />
    </>
  );
}
