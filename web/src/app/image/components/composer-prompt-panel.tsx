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
  isPromptAreaResizing,
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
  onPromptResizeStart,
  onPromptResizeMove,
  onPromptResizeEnd,
  onPromptResizeKeyDown,
  onPromptResizeLostPointerCapture,
  children,
}: ComposerPromptPanelProps) {
  return (
    <div
      ref={composerPanelRef}
      className={cn(
        "relative overflow-visible rounded-[26px] border border-border/85 bg-surface/95 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-all duration-150 focus-within:border-brand/45 focus-within:ring-2 focus-within:ring-brand/15 dark:shadow-[0_24px_80px_-38px_rgba(0,0,0,0.78)] sm:rounded-[22px]",
        isReferenceImageDragActive &&
          "border-brand bg-brand-soft/90 dark:border-brand dark:bg-brand-soft/60",
      )}
      onDragEnter={onReferenceImageDragEnter}
      onDragOver={onReferenceImageDragOver}
      onDragLeave={onReferenceImageDragLeave}
      onDrop={onReferenceImageDrop}
    >
      {isReferenceImageDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[26px] border-2 border-dashed border-brand/70 bg-surface/80 text-sm font-medium text-brand backdrop-blur-sm sm:rounded-[22px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-md">
            <ImagePlus className="size-4" />
            松开上传参考图片
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className={cn(
          "hidden h-3.5 w-full cursor-[ns-resize] touch-none select-none items-center justify-center rounded-t-[22px] focus-visible:outline-none sm:flex",
          isPromptAreaResizing && "cursor-row-resize",
        )}
        onPointerDown={onPromptResizeStart}
        onPointerMove={onPromptResizeMove}
        onPointerUp={onPromptResizeEnd}
        onPointerCancel={onPromptResizeEnd}
        onLostPointerCapture={onPromptResizeLostPointerCapture}
        onKeyDown={onPromptResizeKeyDown}
        aria-label="调整提示词输入区域高度"
        title="拖动调整输入区域高度"
      >
        <span className="h-1 w-9 rounded-full bg-muted-foreground/30 transition-colors hover:bg-muted-foreground/50" />
      </button>
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
                : "输入你想要生成的画面，支持直接粘贴或拖拽参考图片…"
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
          className="min-h-[88px] resize-none rounded-none border-0 bg-transparent px-5 pt-4 pb-2 text-[16px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:min-h-0 sm:px-5 sm:py-3 sm:text-[15px] sm:leading-6"
          style={{ height: promptAreaHeight }}
        />

        <div
          ref={composerToolbarRef}
          className="rounded-b-[26px] bg-transparent px-3 pt-1 pb-2.5 sm:rounded-b-[22px] sm:border-t sm:border-border/60 sm:bg-surface-muted/45 sm:px-4 sm:py-2"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
