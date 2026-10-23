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
        "relative overflow-visible rounded-2xl border border-border/85 bg-surface p-3 shadow-[0_12px_36px_-12px_rgba(24,24,27,0.09)] transition-[box-shadow,border-color] duration-200 focus-within:border-foreground/30 focus-within:shadow-[0_16px_44px_-12px_rgba(24,24,27,0.14)] has-[textarea[data-preset-flash='1']]:border-foreground/50 has-[textarea[data-preset-flash='1']]:ring-2 has-[textarea[data-preset-flash='1']]:ring-foreground/12 dark:shadow-[0_16px_44px_-12px_rgba(0,0,0,0.55)]",
        isReferenceImageDragActive &&
          "border-foreground/60 bg-surface-muted/60",
      )}
      onDragEnter={onReferenceImageDragEnter}
      onDragOver={onReferenceImageDragOver}
      onDragLeave={onReferenceImageDragLeave}
      onDrop={onReferenceImageDrop}
    >
      {isReferenceImageDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-foreground/45 bg-surface/90 text-sm font-medium text-foreground backdrop-blur-xs">
          <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 shadow-sm">
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
          className="min-h-[60px] resize-none rounded-none border-0 bg-transparent px-1 pt-0.5 pb-2 text-[15px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0 sm:min-h-[58px]"
          style={{ height: Math.max(58, Math.min(promptAreaHeight, 220)) }}
        />

        <div
          ref={composerToolbarRef}
          className="pt-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
