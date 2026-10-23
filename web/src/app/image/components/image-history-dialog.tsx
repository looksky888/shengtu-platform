import { History } from "lucide-react";

import { ImageSidebar } from "@/app/image/components/image-sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImageConversation } from "@/store/image-conversations";

type ImageHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ImageConversation[];
  isLoadingHistory: boolean;
  selectedConversationId: string | null;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
};

export function ImageHistoryDialog({
  open,
  onOpenChange,
  conversations,
  isLoadingHistory,
  selectedConversationId,
  onCreateDraft,
  onClearHistory,
  onSelectConversation,
  onDeleteConversation,
  formatConversationTime,
}: ImageHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(82dvh,760px)] w-[92vw] max-w-[440px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface p-0 shadow-xl">
        <DialogHeader className="border-b border-border/65 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <History className="size-4 text-muted-foreground" />
            历史记录
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-2">
          <ImageSidebar
            conversations={conversations}
            isLoadingHistory={isLoadingHistory}
            selectedConversationId={selectedConversationId}
            onCreateDraft={() => {
              onCreateDraft();
              onOpenChange(false);
            }}
            onClearHistory={onClearHistory}
            onSelectConversation={(id) => {
              onSelectConversation(id);
              onOpenChange(false);
            }}
            onDeleteConversation={onDeleteConversation}
            formatConversationTime={formatConversationTime}
            hideActionButtons
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
