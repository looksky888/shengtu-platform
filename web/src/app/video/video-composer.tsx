"use client";

import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
  Coins,
  Film,
  ImageIcon,
  ImagePlus,
  Images,
  Link2,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import {
  cameraMotionPresets,
  ratioPreviewStyle,
  selectedVideoModel,
  selectedVideoPreset,
  selectedVideoSize,
  videoDurations,
  videoModels,
  videoPresets,
  videoResolutions,
  videoSizes,
} from "@/app/video/video-options";
import type { VideoCreationController, VideoInputMode } from "@/app/video/use-video-creation";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [promptHeight, setPromptHeight] = useState(66);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(Boolean(controller.inputReference));
  const [showCameraStrip, setShowCameraStrip] = useState(false);

  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const [durationPopoverOpen, setDurationPopoverOpen] = useState(false);

  const active = controller.task?.status === "queued" || controller.task?.status === "running";
  const submitDisabled =
    !controller.prompt.trim() ||
    controller.submitting ||
    controller.uploadingReference ||
    controller.uploadingReferences ||
    active;

  const estimatedCredits = controller.creditCostPerSecond * controller.seconds;
  const activeSizeSpec = selectedVideoSize(controller.size);
  const activeModelSpec = selectedVideoModel(controller.model);
  const activePresetSpec = selectedVideoPreset(controller.preset);

  const uploaded = controller.uploadedReference;
  const hasFirstFrame = Boolean(uploaded || controller.inputReference.trim());
  const selectedRefAssets = controller.referenceAssets.filter((item) =>
    controller.selectedReferenceAssetIds.includes(item.id),
  );
  const selectedRefCount = controller.selectedReferenceAssetIds.length;

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    void controller.uploadReference(file, { switchToI2V: true });
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
    void controller.uploadReference(files[0], { switchToI2V: true });
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
    setPromptHeight(Math.max(58, Math.min(200, Math.round(session.startHeight + delta))));
  }

  function handleResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeStartRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeStartRef.current = null;
    setIsResizing(false);
  }

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
            void controller.uploadReference(file, { switchToI2V: true });
          }
          event.target.value = "";
        }}
      />

      {/* Contextual Reference & Camera Motion Strip above Composer */}
      {(controller.inputMode !== "t2v" || hasFirstFrame || selectedRefCount > 0 || showCameraStrip) ? (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border/80 bg-surface/95 px-3 py-2 shadow-sm backdrop-blur-md">
          {controller.inputMode === "t2v" && (hasFirstFrame || selectedRefCount > 0) ? (
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
                    controller.clearUploadedReference();
                    controller.setInputReferenceURL("");
                    controller.setSelectedReferenceAssets([]);
                  }}
                >
                  清空暂存
                </button>
              </div>
            </div>
          ) : null}

          {controller.inputMode === "i2v" ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {uploaded ? (
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border border-border/75 bg-zinc-950">
                      <img
                        src={uploaded.preview_url}
                        alt="已上传首帧图"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {uploaded.filename || "已上传首帧参考图"}
                      </p>
                      <p className="font-mono text-[10.5px] text-muted-foreground">
                        第一帧起始画面 · 支持拖拽替换
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => firstFrameInputRef.current?.click()}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/75 bg-surface px-2 text-[11px] font-medium text-foreground transition hover:bg-surface-hover"
                      >
                        <Upload className="size-3" />
                        <span>替换</span>
                      </button>
                      <button
                        type="button"
                        onClick={controller.clearUploadedReference}
                        className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-status-danger-soft hover:text-status-danger"
                        aria-label="移除首帧图片"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => firstFrameInputRef.current?.click()}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-dashed border-border/85 bg-surface-muted/60 px-3 text-xs font-medium text-foreground transition hover:border-foreground/40 hover:bg-surface-hover"
                    >
                      {controller.uploadingReference ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="size-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {controller.uploadingReference
                          ? "正在上传首帧图…"
                          : "上传首帧图片（或直接在输入框粘贴 / 拖入图片）"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUrlInput((prev) => !prev)}
                      className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
                    >
                      <Link2 className="size-3" />
                      <span>{showUrlInput ? "收起图片链接" : "使用图片 URL"}</span>
                    </button>
                  </div>
                )}
              </div>

              {!uploaded && showUrlInput ? (
                <input
                  type="url"
                  value={controller.inputReference}
                  onChange={(event) => controller.setInputReferenceURL(event.target.value)}
                  placeholder="输入首帧图片直链 https://example.com/first-frame.jpg"
                  className="h-8 w-full rounded-lg border border-border/75 bg-surface-muted/65 px-2.5 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/35 focus:bg-surface"
                />
              ) : null}
            </div>
          ) : null}

          {controller.inputMode === "ref" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {selectedRefAssets.length > 0 ? (
                  selectedRefAssets.map((asset, index) => (
                    <div
                      key={asset.id}
                      className="group relative size-11 shrink-0 overflow-hidden rounded-lg border border-border/75 bg-zinc-950"
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
                        className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded bg-black/70 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
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
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-medium text-foreground shadow-2xs transition hover:bg-surface-hover"
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
                (controller.inputMode !== "t2v" || hasFirstFrame || selectedRefCount > 0) &&
                  "border-t border-border/55 pt-1.5",
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
                  className="inline-flex h-6.5 items-center gap-1 rounded-full border border-border/75 bg-surface-muted/70 px-2.5 text-[11px] font-medium text-foreground/85 transition hover:border-foreground/35 hover:bg-surface-hover hover:text-foreground"
                  title={chip.descriptor}
                >
                  <span>+ {chip.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Main Floating Composer Dock (100% aligned with /image ComposerPromptPanel) */}
      <div
        className={cn(
          "relative overflow-visible rounded-[20px] border border-border/85 bg-surface px-3.5 pt-1.5 pb-3 shadow-[0_14px_38px_-14px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.8)] transition-[box-shadow,border-color] duration-200 focus-within:border-foreground/30 focus-within:shadow-[0_18px_46px_-12px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] has-[textarea[data-preset-flash='1']]:border-foreground/50 has-[textarea[data-preset-flash='1']]:ring-2 has-[textarea[data-preset-flash='1']]:ring-foreground/12 dark:shadow-[0_18px_46px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)]",
          isDragActive && "border-foreground/60 bg-surface-muted/60",
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[20px] border-2 border-dashed border-foreground/45 bg-surface/90 text-sm font-medium text-foreground backdrop-blur-xs">
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 shadow-sm">
              <ImagePlus className="size-4" />
              {controller.inputMode === "ref" ? "松开上传至参考图资产库" : "松开上传为视频首帧图片"}
            </span>
          </div>
        ) : null}

        {/* Top Resize Handle + Char Count & Clear */}
        <div className="relative flex h-4 items-center justify-center">
          <button
            type="button"
            aria-label="上下拖拽调整输入框高度"
            title="上下拖拽调整输入框高度"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            className="group/resize flex h-4 w-14 cursor-ns-resize touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          >
            <span
              className={cn(
                "h-1 w-8 rounded-full transition-colors",
                isResizing
                  ? "bg-foreground/60"
                  : "bg-border-strong/60 group-hover/resize:bg-foreground/40",
              )}
            />
          </button>

          <div className="absolute right-0 flex items-center gap-2">
            {controller.prompt.length > 0 ? (
              <>
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
                >
                  <X className="size-3" />
                  <span>清空</span>
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="cursor-text" onClick={() => controller.focusComposer()}>
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
              controller.inputMode === "i2v"
                ? "描述首帧画面之后的镜头推进、主体动作与光影变化（Enter 发送，Shift+Enter 换行）…"
                : controller.inputMode === "ref"
                  ? "描述参考角色/场景在镜头中的调度、神态与交互细节（Enter 发送，Shift+Enter 换行）…"
                  : "描述主体动作、环境光影、运镜轨迹与画面节奏，支持直接粘贴或拖入首帧参考图…"
            }
            maxLength={4000}
            className="min-h-[58px] resize-none rounded-none border-0 bg-transparent px-1 pt-0.5 pb-2 text-[15px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0"
            style={{ height: promptHeight }}
          />

          {/* Compact Director Toolbar (aligned with /image + open-ai-canvas CreationWorkspace) */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border/55 pt-2"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {/* Mode Segmented Groove */}
              <div
                role="tablist"
                aria-label="视频创作模式"
                className="inline-flex h-7.5 items-center rounded-lg bg-surface-muted/95 p-0.5 ring-1 ring-inset ring-black/[0.03] dark:ring-white/[0.05]"
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
                        "inline-flex h-6.5 items-center justify-center rounded-md px-2 text-xs transition-all",
                        selected
                          ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                          : "font-medium text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="sm:hidden">{item.shortLabel}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Model Picker Popover */}
              <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-lg bg-surface-muted/90 px-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface-hover hover:text-foreground"
                    title="选择视频生成模型"
                  >
                    <Sparkles className="size-3.5 text-muted-foreground" />
                    <span>{activeModelSpec.shortLabel}</span>
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-72 p-2">
                  <div className="mb-1.5 px-2 pt-1 text-[11px] font-semibold text-muted-foreground">
                    视频生成引擎
                  </div>
                  <div className="space-y-1">
                    {videoModels.map((item) => {
                      const selected = controller.model === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            controller.setModel(item.value);
                            setModelPopoverOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                            selected
                              ? "bg-surface-muted text-foreground"
                              : "text-foreground/85 hover:bg-surface-hover",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="rounded bg-foreground/[0.07] px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                                {item.badge}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                              {item.detail}
                            </p>
                          </div>
                          {selected ? <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Proportional Ratio + Resolution + Motion Preset Popover (inspired by open-ai-canvas GenerationSettingsMenu) */}
              <Popover open={settingsPopoverOpen} onOpenChange={setSettingsPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-lg bg-surface-muted/90 px-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface-hover hover:text-foreground"
                    title="画幅比例、清晰度与动态风格"
                  >
                    <span className="inline-flex size-4 items-center justify-center">
                      <span
                        style={ratioPreviewStyle(activeSizeSpec.ratio, 13)}
                        className="rounded-[2px] border border-current opacity-80"
                      />
                    </span>
                    <span className="font-mono tabular-nums">
                      {activeSizeSpec.ratio} · {controller.resolutionName.toUpperCase()}
                    </span>
                    {controller.preset !== "custom" ? (
                      <span className="hidden text-muted-foreground md:inline">
                        · {activePresetSpec.label}
                      </span>
                    ) : null}
                    <SlidersHorizontal className="size-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-[320px] space-y-3.5 p-3.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">画幅比例</span>
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {activeSizeSpec.label} · {activeSizeSpec.value}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {videoSizes.map((item) => {
                        const selected = controller.size === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => controller.setSize(item.value)}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] transition-all",
                              selected
                                ? "border-foreground bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-foreground/15 dark:bg-zinc-800/90"
                                : "border-border/75 bg-surface-muted/55 font-medium text-muted-foreground hover:border-border-strong hover:text-foreground",
                            )}
                          >
                            <span className="flex size-4 items-center justify-center">
                              <span
                                style={ratioPreviewStyle(item.ratio, 14)}
                                className="rounded-[2px] border border-current"
                              />
                            </span>
                            <span className="font-mono text-[10.5px] tabular-nums">{item.ratio}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">输出清晰度</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {videoResolutions.map((item) => {
                        const selected = controller.resolutionName === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => controller.setResolutionName(item.value)}
                            className={cn(
                              "flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition-all",
                              selected
                                ? "border-foreground bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-foreground/15 dark:bg-zinc-800/90"
                                : "border-border/75 bg-surface-muted/55 font-medium text-muted-foreground hover:border-border-strong hover:text-foreground",
                            )}
                          >
                            <span className="font-mono">{item.label}</span>
                            <span className="text-[11px] font-normal text-muted-foreground">
                              {item.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">动态与运镜风格</span>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-muted/95 p-1 ring-1 ring-inset ring-black/[0.03] dark:ring-white/[0.05]">
                      {videoPresets.map((item) => {
                        const selected = controller.preset === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            title={item.detail}
                            onClick={() => controller.setPreset(item.value)}
                            className={cn(
                              "flex h-7.5 items-center justify-center rounded-lg px-1.5 text-xs transition-all",
                              selected
                                ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Duration Popover (inspired by open-ai-canvas DurationMenu) */}
              <Popover open={durationPopoverOpen} onOpenChange={setDurationPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7.5 shrink-0 items-center gap-1 rounded-lg bg-surface-muted/90 px-2.5 font-mono text-xs font-medium text-foreground/90 tabular-nums transition-colors hover:bg-surface-hover hover:text-foreground"
                    title="选择视频生成时长"
                  >
                    <Clock3 className="size-3.5 text-muted-foreground" />
                    <span>{controller.seconds}s</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-60 p-2">
                  <div className="mb-1.5 px-2 pt-1 text-[11px] font-semibold text-muted-foreground">
                    镜头生成时长
                  </div>
                  <div className="space-y-1">
                    {videoDurations.map((item) => {
                      const selected = controller.seconds === item.value;
                      const cost = controller.creditCostPerSecond * item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            controller.setSeconds(item.value);
                            setDurationPopoverOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                            selected
                              ? "bg-surface-muted font-semibold text-foreground"
                              : "text-foreground/85 hover:bg-surface-hover",
                          )}
                        >
                          <div>
                            <span className="font-mono text-xs">{item.label}</span>
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                              {item.detail}
                            </span>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-800 tabular-nums dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                            <Coins className="size-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                            {cost} 积分
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Quick Reference Trigger */}
              <button
                type="button"
                onClick={() => {
                  if (controller.inputMode === "ref") {
                    void controller.openReferenceLibrary();
                  } else {
                    firstFrameInputRef.current?.click();
                  }
                }}
                className="inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-lg bg-surface-muted/90 px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-surface-hover hover:text-foreground"
                title={controller.inputMode === "ref" ? "打开多图参考资产库" : "上传首帧图片"}
              >
                <ImagePlus className="size-3.5 text-muted-foreground" />
                <span className="hidden md:inline">
                  {controller.inputMode === "ref" ? "资产库" : "首帧图"}
                </span>
                {controller.inputMode === "ref" && selectedRefCount > 0 ? (
                  <span className="font-mono text-[11px] font-semibold tabular-nums">
                    {selectedRefCount}
                  </span>
                ) : hasFirstFrame ? (
                  <span className="size-1.5 rounded-full bg-status-success" />
                ) : null}
              </button>

              {/* Camera Motion Toolkit Toggle */}
              <button
                type="button"
                aria-pressed={showCameraStrip}
                onClick={() => setShowCameraStrip((prev) => !prev)}
                className={cn(
                  "inline-flex h-7.5 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors",
                  showCameraStrip
                    ? "bg-foreground text-background shadow-2xs"
                    : "bg-surface-muted/90 text-foreground/85 hover:bg-surface-hover hover:text-foreground",
                )}
                title="展开或收起电影运镜词条"
              >
                <Wand2 className="size-3.5" />
                <span className="hidden xl:inline">运镜</span>
              </button>
            </div>

            {/* Right Submit / Cancel Cluster */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span
                className="inline-flex h-7.5 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-500/35 bg-amber-500/12 px-2.5 text-[11px] font-medium text-amber-800 shadow-2xs tabular-nums sm:text-xs dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-300"
                title={`按秒计费：${controller.creditCostPerSecond} 积分/秒 × ${controller.seconds} 秒`}
              >
                <Coins
                  className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span className="hidden opacity-90 sm:inline">扣除</span>
                <strong className="font-mono font-bold text-amber-700 dark:text-amber-200">
                  {estimatedCredits}
                </strong>
                <span>积分</span>
              </span>

              {active ? (
                <button
                  type="button"
                  onClick={() => void controller.cancel()}
                  className="inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 text-xs font-medium text-amber-700 transition hover:bg-amber-500/15 dark:text-amber-300"
                >
                  <Square className="size-3" />
                  <span>终止渲染</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void controller.submit()}
                disabled={submitDisabled}
                className="inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="生成视频"
              >
                {controller.submitting || active ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
                <span className="hidden sm:inline">
                  {controller.submitting
                    ? "提交中"
                    : active
                      ? "生成中"
                      : "开始生成"}
                </span>
                {!controller.submitting && !active ? (
                  <Kbd className="hidden border-white/20 bg-white/15 text-current shadow-none sm:inline-flex">
                    ⏎
                  </Kbd>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle capability hint when completely empty */}
      <div className="hidden items-center justify-center gap-2 text-[11px] text-muted-foreground/80 sm:flex">
        <Film className="size-3" />
        <span>成片自动归档至云端视频库 · 离开页面不会中断生成任务</span>
      </div>
    </div>
  );
}
