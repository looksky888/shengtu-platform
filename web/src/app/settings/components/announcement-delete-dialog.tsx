import { LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { AnnouncementsCardState } from "./use-announcements-card";

export function AnnouncementDeleteDialog({ state }: { state: AnnouncementsCardState }) {
  const isDeleting = state.deletingItem ? state.pendingIds.has(state.deletingItem.id) : false;
  return (
    <Dialog open={Boolean(state.deletingItem)} onOpenChange={(open) => (!open ? state.setDeletingItem(null) : null)}>
      <DialogContent className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>删除公告</DialogTitle>
          <DialogDescription className="text-sm leading-6">确认删除公告「{state.deletingItem?.title || "公告"}」吗？删除后不会再显示在任何页面。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" size="lg" onClick={() => state.setDeletingItem(null)} disabled={isDeleting}>取消</Button>
          <Button type="button" variant="destructive" size="lg" onClick={() => void state.handleDelete()} disabled={isDeleting}>
            {isDeleting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}