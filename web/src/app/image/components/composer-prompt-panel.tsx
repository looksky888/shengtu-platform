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
        "relative overflow-visible rounded-[30px] border border-[#dedee3] bg-[#fffcff]/95 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.5)] backdrop-blur-xl transition-colors dark:border-border dark:bg-card/95 dark:shadow-[0_24px_80px_-38px_rgba(0,0,0,0.78)] sm:rounded-[24px] sm:border-[#f2f3f5] sm:bg-white/95 sm:shadow-[0_24px_80px_-34px_rgba(15,23,42,0.42)] sm:dark:border-border sm:dark:bg-card/95",
        isReferenceImageDragActive &&
          "border-[#1456f0] bg-[#eef4ff]/95 dark:border-sky-500/70 dark:bg-sky-950/45 sm:border-[#1456f0] sm:bg-[#eef4ff]/95 sm:dark:border-sky-500/70 sm:dark:bg-sky-950/45",
      )}
      onDragEnter={onReferenceImageDragEnter}
      onDragOver={onReferenceImageDragOver}
      onDragLeave={onReferenceImageDragLeave}
      onDrop={onReferenceImageDrop}
    >
      {isReferenceImageDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[30px] border-2 border-dashed border-[#1456f0]/70 bg-white/70 text-sm font-medium text-[#1456f0] backdrop-blur-sm dark:border-sky-400/70 dark:bg-background/70 dark:text-sky-300 sm:rounded-[24px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.5)] dark:bg-card/90">
            <ImagePlus className="size-4" />
            松开上传图片
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className={cn(
          "hidden h-4 w-full cursor-[ns-resize] touch-none select-none items-center justify-center rounded-t-[24px] focus-visible:outline-none sm:flex",
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
        <span className="h-1 w-10 rounded-full bg-[#8e8e93]/40 dark:bg-muted-foreground/35" />
      </button>
      <div className="cursor-text" onClick={() => textareaRef.current?.focus()}>
        <Textarea
          aria-label={composerMode === "chat" ? "聊天消息" : "图像提示词"}
          ref={textareaRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onPaste={onTextareaPaste}
          placeholder={composerMode === "chat" ? "输入消息与AI聊天" : referenceImageCount > 0 ? "描述你希望如何修改参考图" : "输入你想要生成的画面，也可直接粘贴图片"}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSubmit();
            }
          }}
          className="min-h-[96px] resize-none rounded-none border-0 bg-transparent px-6 pt-6 pb-2 text-[17px] leading-7 text-[#222222] shadow-none placeholder:text-[#8e8e93] focus-visible:ring-0 dark:text-foreground dark:placeholder:text-muted-foreground sm:min-h-0 sm:px-5 sm:py-4 sm:text-[15px] sm:leading-6"
          style={{ height: promptAreaHeight }}
        />

        <div
          ref={composerToolbarRef}
          className="rounded-b-[30px] bg-transparent px-3 pt-1 pb-3 sm:rounded-b-[24px] sm:border-t sm:border-[#f2f3f5] sm:bg-white/80 sm:px-4 sm:py-2.5 sm:dark:border-border sm:dark:bg-card/80"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
