import type { ReactNode } from "react";
import { ImagePlus, Plus, X } from "lucide-react";

import { useImageComposerContext } from "@/app/image/components/image-composer-context";
import { Textarea } from "@/components/ui/textarea";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

type ComposerPromptPanelProps = {
  children: ReactNode;
  onRemoveFirstReference?: () => void;
};

export function ComposerPromptPanel({
  children,
  onRemoveFirstReference,
}: ComposerPromptPanelProps) {
  const { composerProps, input } = useImageComposerContext();
  const {
    composerMode,
    prompt,
    referenceImages,
    textareaRef,
    onPromptChange,
    onRemoveReferenceImage,
    onSubmit,
  } = composerProps;
  const referenceImageCount = referenceImages.length;
  const firstReference = referenceImages[0];
  const handleRemoveFirstReference =
    onRemoveFirstReference ?? (() => onRemoveReferenceImage(0));

  return (
    <div
      ref={input.composerPanelRef}
      className={cn(
        "relative overflow-visible rounded-[24px] border border-border bg-[#fbfdff]/95 px-4 pt-2 pb-3 shadow-[0_14px_38px_rgba(24,40,72,0.08)] backdrop-blur-md transition-[box-shadow,border-color] duration-200 focus-within:border-[#1456f0]/40 has-[textarea[data-preset-flash='1']]:border-[#1456f0]/60 has-[textarea[data-preset-flash='1']]:ring-2 has-[textarea[data-preset-flash='1']]:ring-[#1456f0]/15 dark:bg-card/95 dark:shadow-[0_24px_56px_-18px_rgba(0,0,0,0.65)] dark:focus-within:border-sky-400/35",
        input.isReferenceImageDragActive &&
          "border-[#1456f0] bg-[#edf4ff]/65 dark:border-sky-400/60 dark:bg-sky-950/25",
      )}
      onDragEnter={input.handleReferenceImageDragEnter}
      onDragOver={input.handleReferenceImageDragOver}
      onDragLeave={input.handleReferenceImageDragLeave}
      onDrop={input.handleReferenceImageDrop}
    >
      {input.isReferenceImageDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[24px] border-2 border-dashed border-[#1456f0]/55 bg-[#fbfdff]/92 text-sm font-medium text-[#1456f0] backdrop-blur-xs dark:border-sky-400/50 dark:bg-card/92 dark:text-sky-300">
          <span className="inline-flex items-center gap-2 rounded-xl border border-[#cfe0ff] bg-[#edf4ff] px-3.5 py-2 shadow-sm dark:border-sky-500/30 dark:bg-sky-950/60">
            <ImagePlus className="size-4" />
            松开上传参考图片
          </span>
        </div>
      ) : null}

      {/* Top Drag-Resize Handle & Clear Micro-Affordance */}
      <div className="relative flex h-3.5 items-center justify-center">
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
          className="group/resize flex h-3.5 w-14 cursor-ns-resize touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/25"
        >
          <span
            className={cn(
              "h-1 w-8 rounded-full transition-colors",
              input.isPromptAreaResizing
                ? "bg-[#1456f0]/75"
                : "bg-border-strong/55 group-hover/resize:bg-[#1456f0]/50",
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

      {/* Main Prompt Area with Signature -4deg Tilted Polaroid Reference Slot */}
      <div
        className="flex cursor-text items-start gap-3 pt-1 pb-2"
        onClick={() => textareaRef.current?.focus()}
      >
        {composerMode === "image" ? (
          <div className="group/polaroid relative mt-0.5 h-[68px] w-[58px] shrink-0 -rotate-[4deg] transition-transform duration-200 hover:rotate-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                input.handlePickReferenceImage();
              }}
              aria-label={
                referenceImageCount > 0
                  ? `已添加 ${referenceImageCount} 张参考图，点击继续上传`
                  : "上传参考图"
              }
              title={
                referenceImageCount > 0
                  ? `已选 ${referenceImageCount} 张参考图，点击继续上传`
                  : "点击或拖拽上传参考图"
              }
              className={cn(
                "relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/30",
                firstReference
                  ? "border border-border bg-white p-1 text-foreground shadow-sm dark:bg-muted"
                  : "border border-dashed border-border-strong/75 bg-[#f2f5fa]/85 text-muted-foreground hover:border-[#1456f0]/50 hover:bg-[#edf4ff] hover:text-[#1456f0] dark:bg-muted/55 dark:hover:border-sky-400/50 dark:hover:bg-sky-950/35 dark:hover:text-sky-300",
              )}
            >
              {firstReference ? (
                <div className="relative h-full w-full overflow-hidden rounded-[8px] bg-surface-muted">
                  <img
                    src={firstReference.dataUrl}
                    alt={firstReference.name || "参考图"}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover/polaroid:opacity-100">
                    <Plus className="size-4" />
                  </span>
                </div>
              ) : (
                <>
                  <ImagePlus className="size-4 stroke-[1.8]" />
                  <span className="font-medium">参考图</span>
                </>
              )}
            </button>

            {firstReference && referenceImageCount === 1 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleRemoveFirstReference();
                }}
                aria-label={`移除参考图 ${firstReference.name || ""}`.trim()}
                title="移除参考图"
                className="absolute -top-1.5 -right-1.5 z-10 inline-flex size-4.5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover/polaroid:opacity-100 group-focus-within/polaroid:opacity-100 hover:border-[#1456f0]/40 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/25 [@media(hover:none)]:opacity-100"
              >
                <X className="size-2.5 stroke-[2.4]" />
              </button>
            ) : null}

            {firstReference && referenceImageCount >= 2 ? (
              <span className="pointer-events-none absolute -top-1.5 -right-1.5 z-10 inline-flex min-w-4.5 items-center justify-center rounded-full bg-[#1456f0] px-1 py-0.5 font-mono text-[9.5px] leading-none font-bold text-white shadow-xs tabular-nums">
                +{referenceImageCount - 1}
              </span>
            ) : null}
          </div>
        ) : null}

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
                ? "描述你希望如何融合或修改参考图（Enter 立即生成，Shift+Enter 换行）…"
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
          className="min-h-[64px] min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-0.5 pt-0.5 pb-1 text-[15px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0"
          style={{ height: Math.max(64, Math.min(input.promptAreaHeight, 220)) }}
        />
      </div>

      {/* Frameless Inline Bottom Toolbar */}
      <div
        ref={input.composerToolbarRef}
        className="pt-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
