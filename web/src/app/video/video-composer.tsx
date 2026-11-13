"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUp,
  Coins,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Link2,
  LoaderCircle,
  Plus,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { VideoComposerToolbarPopovers } from "@/app/video/video-composer-popovers";
import { cameraMotionPresets } from "@/app/video/video-options";
import type { VideoCreationController, VideoInputMode } from "@/app/video/use-video-creation";
import { Textarea } from "@/components/ui/textarea";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

const VIDEO_INPUT_MODES: ReadonlyArray<{
  value: VideoInputMode;
  label: string;
  shortLabel: string;
}> = [
  { value: "t2v", label: "文生视频", shortLabel: "文生" },
  { value: "i2v", label: "图生视频", shortLabel: "首帧" },
  { value: "ref", label: "多图参考", shortLabel: "参考" },
];

export function VideoComposer({ controller }: { controller: VideoCreationController }) {
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const [promptHeight, setPromptHeight] = useState(64);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(
    null,
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(Boolean(controller.inputReference));
  const [showCameraStrip, setShowCameraStrip] = useState(false);
  const [localFirstFramePreviewUrl, setLocalFirstFramePreviewUrl] = useState<string | null>(null);
  const [localFirstFrameName, setLocalFirstFrameName] = useState("");

  // Revoke any transient object URL when replaced or unmounted
  useEffect(() => {
    const objectUrl = localFirstFramePreviewUrl;
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [localFirstFramePreviewUrl]);

  // Once controller finishes uploading (or errors out), hand off to controller.uploadedReference
  useEffect(() => {
    if (!controller.uploadingReference && localFirstFramePreviewUrl) {
      setLocalFirstFramePreviewUrl(null);
      setLocalFirstFrameName("");
    }
  }, [controller.uploadingReference, localFirstFramePreviewUrl]);

  const active = controller.task?.status === "queued" || controller.task?.status === "running";
  const submitDisabled =
    !controller.prompt.trim() ||
    controller.submitting ||
    controller.uploadingReference ||
    controller.uploadingReferences ||
    active;

  const estimatedCredits = controller.creditCostPerSecond * controller.seconds;

  const uploaded = controller.uploadedReference;
  const firstFramePreviewUrl =
    uploaded?.preview_url || localFirstFramePreviewUrl || controller.inputReference.trim();
  const firstFrameLabel =
    uploaded?.filename || localFirstFrameName || (controller.inputReference.trim() ? "首帧直链图" : "");
  const hasFirstFrame = Boolean(firstFramePreviewUrl);

  const selectedRefAssets = controller.referenceAssets.filter((item) =>
    controller.selectedReferenceAssetIds.includes(item.id),
  );
  const selectedRefCount = controller.selectedReferenceAssetIds.length;
  const firstRefAsset = selectedRefAssets[0];

  function stageAndUploadFirstFrame(file: File) {
    setLocalFirstFramePreviewUrl(URL.createObjectURL(file));
    setLocalFirstFrameName(file.name || "首帧参考图");
    void controller.uploadReference(file, { switchToI2V: true });
  }

  function handleClearFirstFrame() {
    setLocalFirstFramePreviewUrl(null);
    setLocalFirstFrameName("");
    controller.clearUploadedReference();
    controller.setInputReferenceURL("");
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    stageAndUploadFirstFrame(file);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files || []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    if (controller.inputMode === "ref") {
      void controller.uploadReferences(files);
      void controller.openReferenceLibrary();
      return;
    }
    stageAndUploadFirstFrame(files[0]);
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeStartRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: promptHeight,
    };
    setIsResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeStartRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const delta = session.startY - event.clientY;
    setPromptHeight(Math.max(64, Math.min(220, Math.round(session.startHeight + delta))));
  }

  function handleResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeStartRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeStartRef.current = null;
    setIsResizing(false);
  }

  const showT2VStagedNotice =
    controller.inputMode === "t2v" && (hasFirstFrame || selectedRefCount > 0);
  const showI2VUrlBar = controller.inputMode === "i2v" && !uploaded && showUrlInput;
  const showUploadingHint = controller.uploadingReference;
  const showRefStrip = controller.inputMode === "ref";
  const showContextualStrip =
    showT2VStagedNotice ||
    showI2VUrlBar ||
    showUploadingHint ||
    showRefStrip ||
    showCameraStrip;

  const isRefMode = controller.inputMode === "ref";
  const polaroidPreviewSrc = isRefMode ? firstRefAsset?.url || "" : firstFramePreviewUrl;
  const polaroidHasImage = Boolean(polaroidPreviewSrc);

  return (
    <div className="w-full space-y-2">
      <input
        ref={firstFrameInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            stageAndUploadFirstFrame(file);
          }
          event.target.value = "";
        }}
      />

      {/* Sleek Contextual Strip above Composer (only when multi-ref, URL input, camera strip, or upload status is active) */}
      {showContextualStrip ? (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border/75 bg-surface/92 px-3 py-2 shadow-xs backdrop-blur-md dark:border-white/[0.08] dark:bg-[#18191e]/95">
          {showUploadingHint ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin text-foreground" />
              <span>正在上传首帧参考图{firstFrameLabel ? `（${firstFrameLabel}）` : ""}…</span>
            </div>
          ) : null}

          {showT2VStagedNotice ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                当前为「文生视频」，不会携带已暂存的
                {hasFirstFrame ? "首帧图" : ""}
                {hasFirstFrame && selectedRefCount > 0 ? "与" : ""}
                {selectedRefCount > 0 ? ` ${selectedRefCount} 张参考图` : ""}
              </span>
              <div className="flex items-center gap-2">
                {hasFirstFrame ? (
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    onClick={() => controller.setInputMode("i2v")}
                  >
                    切回图生视频
                  </button>
                ) : null}
                {selectedRefCount > 0 ? (
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    onClick={() => controller.setInputMode("ref")}
                  >
                    切回多图参考
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-status-danger"
                  onClick={() => {
                    handleClearFirstFrame();
                    controller.setSelectedReferenceAssets([]);
                  }}
                >
                  清空暂存
                </button>
              </div>
            </div>
          ) : null}

          {showI2VUrlBar ? (
            <div className="flex items-center gap-2">
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                type="url"
                value={controller.inputReference}
                onChange={(event) => controller.setInputReferenceURL(event.target.value)}
                placeholder="输入首帧图片直链 https://example.com/first-frame.jpg"
                className="h-8 min-w-0 flex-1 rounded-lg border border-border/75 bg-surface-muted/65 px-2.5 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/35 focus:bg-surface dark:border-white/[0.1] dark:bg-white/[0.04]"
              />
              <button
                type="button"
                onClick={() => setShowUrlInput(false)}
                className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                aria-label="收起图片链接输入"
                title="收起图片链接"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          {showRefStrip ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {selectedRefAssets.length > 0 ? (
                  selectedRefAssets.map((asset, index) => (
                    <div
                      key={asset.id}
                      className="group relative size-12 shrink-0 overflow-hidden rounded-xl border border-border/75 bg-zinc-950 dark:border-white/[0.12]"
                    >
                      <img
                        src={asset.url}
                        alt={asset.name || `参考图 ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 font-mono text-[9px] text-white">
                        #{index + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={`移除参考图 ${index + 1}`}
                        onClick={() => controller.toggleReferenceAsset(asset.id)}
                        className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-black/75 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    尚未勾选角色或场景参考图（支持最多 7 张保持跨镜头一致性）
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void controller.openReferenceLibrary()}
                className="inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-surface px-3 text-xs font-medium text-foreground shadow-2xs transition hover:bg-surface-hover dark:border-white/[0.1] dark:bg-white/[0.06]"
              >
                <Images className="size-3.5 text-muted-foreground" />
                <span>参考资产库 ({selectedRefCount}/7)</span>
              </button>
            </div>
          ) : null}

          {showCameraStrip ? (
            <div
              className={cn(
                "flex flex-wrap items-center gap-1.5",
                (showUploadingHint || showT2VStagedNotice || showI2VUrlBar || showRefStrip) &&
                  "border-t border-border/50 pt-1.5 dark:border-white/[0.06]",
              )}
            >
              <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Wand2 className="size-3" />
                <span>镜头语言：</span>
              </span>
              {cameraMotionPresets.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => controller.appendCameraStyleChip(chip.descriptor)}
                  className="inline-flex h-6.5 items-center gap-1 rounded-full border border-border/70 bg-surface-muted/70 px-2.5 text-[11px] font-medium text-foreground/85 transition hover:border-foreground/35 hover:bg-surface-hover hover:text-foreground dark:border-white/[0.08] dark:bg-white/[0.04]"
                  title={chip.descriptor}
                >
                  <span>+ {chip.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Main Yingce Darkroom Floating Composer Dock (#18191e rounded-[22px], 100% aligned with /image) */}
      <div
        className={cn(
          "relative overflow-visible rounded-[22px] border border-border/80 bg-surface px-3.5 pt-2 pb-3 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.12)] transition-[box-shadow,border-color] duration-200 focus-within:border-foreground/25 has-[textarea[data-preset-flash='1']]:border-foreground/50 has-[textarea[data-preset-flash='1']]:ring-2 has-[textarea[data-preset-flash='1']]:ring-foreground/12 dark:border-white/[0.08] dark:bg-[#18191e] dark:shadow-[0_24px_56px_-18px_rgba(0,0,0,0.72)] dark:focus-within:border-white/[0.18]",
          isDragActive &&
            "border-foreground/60 bg-surface-muted/60 dark:border-white/35",
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[22px] border-2 border-dashed border-foreground/45 bg-surface/90 text-sm font-medium text-foreground backdrop-blur-xs dark:bg-[#18191e]/92">
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 shadow-sm">
              <ImagePlus className="size-4" />
              {isRefMode ? "松开上传至参考图资产库" : "松开上传为视频首帧图片"}
            </span>
          </div>
        ) : null}

        {/* Top Resize Handle + Char Count & Clear */}
        <div className="relative flex h-3.5 items-center justify-center">
          <button
            type="button"
            aria-label="上下拖拽调整输入框高度"
            title="上下拖拽调整输入框高度"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            className="group/resize flex h-3.5 w-14 cursor-ns-resize touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          >
            <span
              className={cn(
                "h-1 w-8 rounded-full transition-colors",
                isResizing
                  ? "bg-foreground/60"
                  : "bg-border-strong/50 group-hover/resize:bg-foreground/40",
              )}
            />
          </button>

          {controller.prompt.length > 0 ? (
            <div className="absolute right-0 flex items-center gap-2">
              <span className="hidden font-mono text-[10.5px] text-muted-foreground tabular-nums sm:inline">
                {controller.prompt.length}/4000
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  controller.setPrompt("");
                  controller.focusComposer();
                }}
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="清空视频画面描述"
                title="清空输入内容"
              >
                <X className="size-3" />
                <span>清空</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Main Prompt Area with Signature -4deg Tilted Polaroid First-Frame Slot */}
        <div
          className="flex cursor-text items-start gap-3 pt-1 pb-2"
          onClick={() => controller.focusComposer()}
        >
          <div className="group/polaroid relative mt-0.5 h-[68px] w-[58px] shrink-0 -rotate-[4deg] transition-transform duration-200 hover:rotate-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (isRefMode) {
                  void controller.openReferenceLibrary();
                } else {
                  firstFrameInputRef.current?.click();
                }
              }}
              aria-label={
                isRefMode
                  ? selectedRefCount > 0
                    ? `已选 ${selectedRefCount} 张参考图，点击管理`
                    : "选择视频参考图"
                  : hasFirstFrame
                    ? "替换视频首帧参考图"
                    : "点击或拖拽上传首帧图"
              }
              title={
                isRefMode
                  ? selectedRefCount > 0
                    ? `已选 ${selectedRefCount} 张参考图，点击打开资产库`
                    : "点击打开多图参考资产库"
                  : hasFirstFrame
                    ? `${firstFrameLabel || "已设置首帧图"} · 点击替换`
                    : "点击或拖拽上传首帧图"
              }
              className={cn(
                "relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25",
                polaroidHasImage
                  ? "border border-border/80 bg-surface-raised p-1 text-foreground shadow-sm dark:border-white/[0.14] dark:bg-[#22242c]"
                  : "border border-dashed border-border-strong/70 bg-surface-muted/50 text-muted-foreground hover:border-foreground/40 hover:bg-surface-muted hover:text-foreground dark:border-white/[0.15] dark:bg-white/[0.03] dark:hover:border-white/[0.28] dark:hover:bg-white/[0.06]",
              )}
            >
              {polaroidHasImage ? (
                <div className="relative h-full w-full overflow-hidden rounded-[8px] bg-surface-muted">
                  <img
                    src={polaroidPreviewSrc}
                    alt={isRefMode ? firstRefAsset?.name || "参考图" : firstFrameLabel || "首帧图"}
                    className="h-full w-full object-cover"
                  />
                  {controller.uploadingReference && !isRefMode ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white">
                      <LoaderCircle className="size-4 animate-spin" />
                    </span>
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover/polaroid:opacity-100">
                      <Plus className="size-4" />
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {controller.uploadingReference && !isRefMode ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="size-4 stroke-[1.8]" />
                  )}
                  <span className="font-medium">{isRefMode ? "参考图" : "首帧图"}</span>
                </>
              )}
            </button>

            {/* Hover/Focus Remove Button for First-Frame or Single Ref */}
            {!isRefMode && hasFirstFrame ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleClearFirstFrame();
                }}
                aria-label="移除首帧图片"
                title="移除首帧图片"
                className="absolute -top-1.5 -right-1.5 z-10 inline-flex size-4.5 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover/polaroid:opacity-100 group-focus-within/polaroid:opacity-100 hover:border-foreground/35 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 [@media(hover:none)]:opacity-100 dark:border-white/[0.16] dark:bg-[#22242c] dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <X className="size-2.5 stroke-[2.4]" />
              </button>
            ) : null}

            {isRefMode && firstRefAsset && selectedRefCount === 1 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  controller.toggleReferenceAsset(firstRefAsset.id);
                }}
                aria-label="移除参考图"
                title="移除参考图"
                className="absolute -top-1.5 -right-1.5 z-10 inline-flex size-4.5 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover/polaroid:opacity-100 group-focus-within/polaroid:opacity-100 hover:border-foreground/35 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100 dark:border-white/[0.16] dark:bg-[#22242c] dark:text-zinc-200"
              >
                <X className="size-2.5 stroke-[2.4]" />
              </button>
            ) : null}

            {isRefMode && selectedRefCount >= 2 ? (
              <span className="pointer-events-none absolute -top-1.5 -right-1.5 z-10 inline-flex min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 py-0.5 font-mono text-[9.5px] leading-none font-bold text-background shadow-xs tabular-nums">
                +{selectedRefCount - 1}
              </span>
            ) : null}
          </div>

          <Textarea
            ref={controller.composerTextareaRef}
            id="video-prompt"
            aria-label="视频画面描述"
            value={controller.prompt}
            onChange={(event) => controller.setPrompt(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (isImeComposing(event)) {
                return;
              }
              if (event.key === "Enter" && (!event.shiftKey || event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (!submitDisabled) {
                  void controller.submit();
                }
              }
            }}
            placeholder={
              controller.inputMode === "i2v" || hasFirstFrame
                ? "描述首帧画面之后的镜头推进、主体动作与光影变化（Enter 立即生成，Shift+Enter 换行）…"
                : controller.inputMode === "ref"
                  ? "描述参考角色/场景在镜头中的调度、神态与交互细节（Enter 立即生成，Shift+Enter 换行）…"
                  : "描述主体动作、环境光影、运镜轨迹与画面节奏，支持粘贴或拖入首帧参考图…"
            }
            maxLength={4000}
            className="min-h-[64px] min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-0.5 pt-0.5 pb-1 text-[15px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0"
            style={{ height: promptHeight }}
          />
        </div>

        {/* Frameless Inline Bottom Pill Toolbar (100% aligned with /image ComposerToolbar) */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 pt-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {/* [图片 / 视频] Studio Mode Switcher right in Composer Toolbar */}
            <div
              role="navigation"
              aria-label="切换图片或视频创作"
              className="inline-flex h-8 shrink-0 items-center rounded-full bg-surface-muted/85 p-0.5 text-xs font-medium text-muted-foreground dark:bg-white/[0.06]"
            >
              <Link
                to="/image"
                onMouseEnter={() => preloadRoute("/image")}
                title="切换到图片创作工作台"
                className="inline-flex h-7 items-center justify-center gap-1 rounded-full px-2.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ImageIcon className="size-3.5" />
                <span>图片</span>
              </Link>
              <span className="inline-flex h-7 items-center justify-center gap-1 rounded-full bg-surface px-2.5 font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.04] dark:bg-white/[0.14] dark:ring-white/[0.08]">
                <Film className="size-3.5" />
                <span>视频</span>
              </span>
            </div>

            {/* Video Input Mode Pill Groove */}
            <div
              role="tablist"
              aria-label="视频生成输入模式"
              className="inline-flex h-8 shrink-0 items-center rounded-full bg-surface-muted/85 p-0.5 text-xs font-medium text-muted-foreground dark:bg-white/[0.06]"
            >
              {VIDEO_INPUT_MODES.map((item) => {
                const selected = controller.inputMode === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => controller.setInputMode(item.value)}
                    className={cn(
                      "inline-flex h-7 items-center justify-center rounded-full px-2.5 text-xs transition-all",
                      selected
                        ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.04] dark:bg-white/[0.14] dark:ring-white/[0.08]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="md:hidden">{item.shortLabel}</span>
                    <span className="hidden md:inline">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <VideoComposerToolbarPopovers controller={controller} />

            {controller.inputMode === "i2v" && !uploaded ? (
              <button
                type="button"
                aria-pressed={showUrlInput}
                onClick={() => setShowUrlInput((prev) => !prev)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                  showUrlInput
                    ? "bg-foreground text-background shadow-2xs"
                    : "bg-surface-muted/85 text-muted-foreground hover:bg-surface-hover hover:text-foreground dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
                )}
                title="使用图片直链 URL 作为首帧"
              >
                <Link2 className="size-3.5" />
                <span className="hidden xl:inline">图片链接</span>
              </button>
            ) : null}

            {/* Camera Motion Toolkit Toggle */}
            <button
              type="button"
              aria-pressed={showCameraStrip}
              onClick={() => setShowCameraStrip((prev) => !prev)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                showCameraStrip
                  ? "bg-foreground text-background shadow-2xs"
                  : "bg-surface-muted/85 text-muted-foreground hover:bg-surface-hover hover:text-foreground dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
              )}
              title="展开或收起电影运镜词条"
            >
              <Wand2 className="size-3.5" />
              <span className="hidden xl:inline">运镜</span>
            </button>
          </div>

          {/* Right Amber Credits Pill + Solid Rounded Submit Button (100% aligned with /image) */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {estimatedCredits > 0 ? (
              <span
                className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border border-amber-500/35 bg-amber-500/12 px-2.5 text-[11px] font-medium text-amber-800 tabular-nums sm:text-xs dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-300"
                title={`按秒计费：${controller.creditCostPerSecond} 积分/秒 × ${controller.seconds} 秒`}
              >
                <Coins
                  className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span className="font-mono font-semibold text-amber-700 dark:text-amber-200">
                  - {estimatedCredits}
                </span>
                <span>积分</span>
              </span>
            ) : null}

            {active ? (
              <button
                type="button"
                onClick={() => void controller.cancel()}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 text-xs font-medium text-amber-700 transition hover:bg-amber-500/15 dark:text-amber-300"
              >
                <Square className="size-3" />
                <span>终止</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void controller.submit()}
              disabled={submitDisabled}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#F5F5F5] dark:text-[#111216] dark:hover:bg-white"
              aria-label="生成视频"
              title={submitDisabled ? "请输入视频画面描述后生成" : "立即生成视频"}
            >
              {controller.submitting || active ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4 stroke-[2.25]" />
              )}
              <span className="hidden sm:inline">
                {controller.submitting ? "提交中" : active ? "生成中" : "立即生成"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
