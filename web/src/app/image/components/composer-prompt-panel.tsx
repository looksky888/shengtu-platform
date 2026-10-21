import type {
  ClipboardEventHandler,
  DragEventHandler,
  KeyboardEventHandler,
  PointerEventHandler,
  ReactNode,
  RefObject,
} from "react";
import { ImagePlus } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

type ComposerPromptPanelProps = {
  composerMode: "chat" | "image";
  prompt: string;
  referenceImageCount: number;
  promptAreaHeight: number;
  isPromptAreaResizing: boolean;
  isReferenceImageDragActive: boolean;
  composerPanelRef: RefObject<HTMLDivElement | null>;
  composerToolbarRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onPromptChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onTextareaPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onReferenceImageDragEnter: DragEventHandler<HTMLDivElement>;
  onReferenceImageDragOver: DragEventHandler<HTMLDivElement>;
  onReferenceImageDragLeave: DragEventHandler<HTMLDivElement>;
  onReferenceImageDrop: DragEventHandler<HTMLDivElement>;
  onPromptResizeStart: PointerEventHandler<HTMLButtonElement>;
  onPromptResizeMove: PointerEventHandler<HTMLButtonElement>;
  onPromptResizeEnd: PointerEventHandler<HTMLButtonElement>;
  onPromptResizeKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onPromptResizeLostPointerCapture: () => void;
  children: ReactNode;
};

export function ComposerPromptPanel({
  composerMode,
  prompt,
  referenceImageCount,
  promptAreaHeight,
  isReferenceImageDragActive,
  composerPanelRef,
  composerToolbarRef,
  textareaRef,
  onPromptChange,
  onSubmit,
  onTextareaPaste,
  onReferenceImageDragEnter,
  onReferenceImageDragOver,
  onReferenceImageDragLeave,
  onReferenceImageDrop,
  children,
}: ComposerPromptPanelProps) {
  return (
    <div
      ref={composerPanelRef}
      className={cn(
        "relative overflow-visible rounded-2xl border border-border/85 bg-card/95 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-all duration-150 focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/12 dark:shadow-[0_16px_48px_-20px_rgba(0,0,0,0.65)]",
        isReferenceImageDragActive &&
          "border-primary bg-primary/5 dark:border-primary dark:bg-primary/10",
      )}
      onDragEnter={onReferenceImageDragEnter}
      onDragOver={onReferenceImageDragOver}
      onDragLeave={onReferenceImageDragLeave}
      onDrop={onReferenceImageDrop}
    >
      {isReferenceImageDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/70 bg-card/85 text-sm font-medium text-primary backdrop-blur-xs">
          <span className="inline-flex items-center gap-2 rounded-lg bg-card px-3.5 py-2 shadow-sm">
            <ImagePlus className="size-4" />
            松开上传参考图片
          </span>
        </div>
      ) : null}
      <div className="cursor-text" onClick={() => textareaRef.current?.focus()}>
        <Textarea
          aria-label={composerMode === "chat" ? "聊天消息" : "图像提示词"}
          ref={textareaRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onPaste={onTextareaPaste}
          placeholder={
            composerMode === "chat"
              ? "输入消息与 AI 对话（Enter 发送，Shift+Enter 换行）"
              : referenceImageCount > 0
                ? "描述你希望如何修改参考图（Enter 发送，Shift+Enter 换行）"
                : "描述想要生成的画面细节，支持粘贴或拖拽参考图（Enter 发送，Shift+Enter 换行）…"
          }
          onKeyDown={(event) => {
            if (isImeComposing(event)) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSubmit();
            }
          }}
          className="min-h-[68px] resize-none rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1.5 text-[15px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 sm:min-h-[64px] sm:px-4 sm:pt-3.5 sm:pb-1.5"
          style={{ height: Math.max(64, Math.min(promptAreaHeight, 220)) }}
        />

        <div
          ref={composerToolbarRef}
          className="rounded-b-2xl px-3 pt-1 pb-2.5 sm:px-3.5 sm:pb-3"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
