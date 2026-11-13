import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Clock3, X } from "lucide-react";

import { ImageSidebar } from "@/app/image/components/image-sidebar";
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
  onRenameConversation?: (id: string, title: string) => void | Promise<void>;
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
  onRenameConversation,
  formatConversationTime,
}: ImageHistoryDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby="image-history-drawer-desc"
          className="fixed inset-y-0 right-0 z-50 flex h-dvh w-[min(92vw,360px)] flex-col overflow-hidden border-l border-border/75 bg-surface text-foreground shadow-2xl duration-200 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:w-[360px] dark:bg-[#141519]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border/65 px-4 py-3.5">
            <DialogPrimitive.Title className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <Clock3 className="size-4 text-muted-foreground" />
              <span>历史创作会话</span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
                {conversations.length}
              </span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              id="image-history-drawer-desc"
              className="sr-only"
            >
              切换、搜索、重命名或清理多轮生图创作会话
            </DialogPrimitive.Description>
            <DialogPrimitive.Close
              aria-label="关闭历史会话抽屉"
              className="inline-flex size-7.5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-2.5 pb-4">
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
              onRenameConversation={onRenameConversation}
              formatConversationTime={formatConversationTime}
              embeddedInDialog
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
