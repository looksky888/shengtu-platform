import type { ReactNode } from "react";
import { ImagePlus, X } from "lucide-react";

import { useImageComposerContext } from "@/app/image/components/image-composer-context";
import { Textarea } from "@/components/ui/textarea";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

type ComposerPromptPanelProps = {
  children: ReactNode;
};

export function ComposerPromptPanel({ children }: ComposerPromptPanelProps) {
  const { composerProps, input } = useImageComposerContext();
  const {
    composerMode,
    prompt,
    referenceImages,
    textareaRef,
    onPromptChange,
    onSubmit,
  } = composerProps;
  const referenceImageCount = referenceImages.length;

  return (
    <div
      ref={input.composerPanelRef}
      className={cn(
        "relative overflow-visible rounded-[20px] border border-border/85 bg-surface px-3.5 pt-1.5 pb-3 shadow-[0_14px_38px_-14px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.8)] transition-[box-shadow,border-color] duration-200 focus-within:border-foreground/30 focus-within:shadow-[0_18px_46px_-12px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] has-[textarea[data-preset-flash='1']]:border-foreground/50 has-[textarea[data-preset-flash='1']]:ring-2 has-[textarea[data-preset-flash='1']]:ring-foreground/12 dark:shadow-[0_18px_46px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)]",
        input.isReferenceImageDragActive &&
          "border-foreground/60 bg-surface-muted/60",
      )}
      onDragEnter={input.handleReferenceImageDragEnter}
      onDragOver={input.handleReferenceImageDragOver}
      onDragLeave={input.handleReferenceImageDragLeave}
      onDrop={input.handleReferenceImageDrop}
    >
      {input.isReferenceImageDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[20px] border-2 border-dashed border-foreground/45 bg-surface/90 text-sm font-medium text-foreground backdrop-blur-xs">
          <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 shadow-sm">
            <ImagePlus className="size-4" />
            松开上传参考图片
          </span>
        </div>
      ) : null}

      {/* Top Drag-Resize Handle & Clear Micro-Affordance */}
      <div className="relative flex h-4 items-center justify-center">
        <button
          type="button"
          aria-label="上下拖拽调整输入框高度"
          title="上下拖拽调整输入框高度"
          onPointerDown={input.handlePromptResizeStart}
          onPointerMove={input.handlePromptResizeMove}
          onPointerUp={input.handlePromptResizeEnd}
          onPointerCancel={input.handlePromptResizeEnd}
          onLostPointerCapture={input.handlePromptResizeLostPointerCapture}
          onKeyDown={input.handlePromptResizeKeyDown}
          className="group/resize flex h-4 w-14 cursor-ns-resize touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        >
          <span
            className={cn(
              "h-1 w-8 rounded-full transition-colors",
              input.isPromptAreaResizing
                ? "bg-foreground/60"
                : "bg-border-strong/60 group-hover/resize:bg-foreground/40",
            )}
          />
        </button>

        {prompt.length > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPromptChange("");
              textareaRef.current?.focus();
            }}
            className="absolute right-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="清空提示词"
            title="清空输入内容"
          >
            <X className="size-3" />
            <span>清空</span>
          </button>
        ) : null}
      </div>

      <div className="cursor-text" onClick={() => textareaRef.current?.focus()}>
        <Textarea
          aria-label={composerMode === "chat" ? "聊天消息" : "图像提示词"}
          ref={textareaRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onPaste={input.handleTextareaPaste}
          placeholder={
            composerMode === "chat"
              ? "输入消息与 AI 对话（Enter 发送，Shift+Enter 换行）"
              : referenceImageCount > 0
                ? "描述你希望如何修改参考图（Enter 发送，Shift+Enter 换行）"
                : "描述想要生成的画面构图、光影与材质细节，支持粘贴或拖拽参考图…"
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
          className="min-h-[58px] resize-none rounded-none border-0 bg-transparent px-1 pt-0.5 pb-2 text-[15px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0"
          style={{ height: Math.max(58, Math.min(input.promptAreaHeight, 220)) }}
        />

        <div
          ref={input.composerToolbarRef}
          className="border-t border-border/55 pt-2"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
