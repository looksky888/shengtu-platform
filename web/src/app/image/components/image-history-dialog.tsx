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
      <DialogContent className="flex h-[min(82dvh,760px)] w-[92vw] max-w-[460px] flex-col overflow-hidden rounded-[32px] border-white/80 bg-white p-0 shadow-[0_32px_110px_-38px_rgba(15,23,42,0.45)] sm:rounded-[36px]">
        <DialogHeader className="px-6 pt-7 pb-4 sm:px-8">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <History className="size-5" />
            历史记录
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 sm:px-8">
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
