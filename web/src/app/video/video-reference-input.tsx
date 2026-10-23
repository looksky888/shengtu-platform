import { ImageIcon, Images, Link2, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { VideoCreationController } from "./use-video-creation";

const acceptedTypes = "image/png,image/jpeg,image/webp,image/gif";

export type VideoInputMode = "t2v" | "i2v" | "ref";

export function VideoReferenceInput({
  controller,
  mode = "i2v",
}: {
  controller: VideoCreationController;
  mode?: VideoInputMode;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showURL, setShowURL] = useState(Boolean(controller.inputReference));
  const uploaded = controller.uploadedReference;
  const hasFirstFrame = Boolean(uploaded || controller.inputReference.trim());
  const selectedRefCount = controller.selectedReferenceAssetIds.length;

  function uploadDroppedFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void controller.uploadReference(file);
  }

  if (mode === "t2v") {
    if (!hasFirstFrame && selectedRefCount === 0) {
      return null;
    }
    return (
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-muted/60 px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          已附加 {hasFirstFrame ? "首帧图" : ""}
          {hasFirstFrame && selectedRefCount > 0 ? " + " : ""}
          {selectedRefCount > 0 ? `${selectedRefCount} 张参考图` : ""}
        </span>
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => {
            controller.clearUploadedReference();
            controller.setInputReferenceURL("");
            controller.setSelectedReferenceAssets([]);
          }}
        >
          清空参考
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {mode === "i2v" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-tight text-foreground">首帧参考</h2>
            <div className="flex items-center gap-2">
              {!uploaded ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowURL((value) => !value)}
                >
                  <Link2 className="size-3" />
                  {showURL ? "收起链接" : "图片链接"}
                </button>
              ) : null}
              <span className="text-[11px] text-muted-foreground">第一帧画面</span>
            </div>
          </div>
          <input
            ref={picker}
            type="file"
            accept={acceptedTypes}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void controller.uploadReference(file);
              event.target.value = "";
            }}
          />
          {uploaded ? (
            <div className="group relative overflow-hidden rounded-xl border border-border/75 bg-zinc-950">
              <img src={uploaded.preview_url} alt="已上传的首帧图片" className="h-24 w-full object-contain" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-8 text-white">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{uploaded.filename || "首帧图片"}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-white/60">{formatBytes(uploaded.size_bytes)} · 将作为第一帧</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="icon" variant="ghost" className="size-7 rounded-md text-white hover:bg-white/15 hover:text-white" aria-label="替换首帧图片" onClick={() => picker.current?.click()}><Upload className="size-3.5" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="size-7 rounded-md text-white hover:bg-white/15 hover:text-white" aria-label="移除首帧图片" onClick={controller.clearUploadedReference}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              className={cn(
                "flex min-h-14 items-center justify-between gap-2.5 rounded-xl border border-dashed bg-surface-muted/50 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                dragging
                  ? "border-foreground bg-surface-muted text-foreground"
                  : "border-border/80 text-muted-foreground hover:border-foreground/35 hover:bg-surface-hover hover:text-foreground",
              )}
              onClick={() => picker.current?.click()}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") picker.current?.click(); }}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={uploadDroppedFile}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface text-muted-foreground shadow-2xs">
                  {controller.uploadingReference ? <LoaderCircle className="size-4 animate-spin text-foreground" /> : <ImageIcon className="size-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{controller.uploadingReference ? "正在上传…" : "点击或拖拽上传首帧图"}</p>
                  <p className="truncate text-[10px] text-muted-foreground">PNG / JPG / WebP / GIF ≤ 20MB</p>
                </div>
              </div>
              <span className="shrink-0 rounded-lg border border-border/75 bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs">
                选择文件
              </span>
            </div>
          )}
          {!uploaded && showURL ? (
            <Input value={controller.inputReference} onChange={(event) => controller.setInputReferenceURL(event.target.value)} placeholder="https://example.com/first-frame.jpg" className="h-8 rounded-lg text-xs" />
          ) : null}
        </div>
      ) : null}

      {mode === "ref" ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-tight text-foreground">风格与角色参考</h2>
              <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                {selectedRefCount}/7
              </span>
            </div>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/75 bg-surface px-2.5 text-[11px] font-medium text-foreground shadow-2xs transition-colors hover:bg-surface-hover"
              onClick={() => void controller.openReferenceLibrary()}
            >
              <Images className="size-3.5 text-muted-foreground" />
              <span>从资产库选择</span>
            </button>
          </div>
          {selectedRefCount > 0 ? (
            <div className="grid grid-cols-5 gap-1.5">
              {controller.referenceAssets.filter((item) => controller.selectedReferenceAssetIds.includes(item.id)).map((item, index) => (
                <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border/75 bg-zinc-950">
                  <img src={item.url} alt={`参考图片 ${index + 1}`} className="h-full w-full object-cover" />
                  <button type="button" aria-label={`移除参考图片 ${index + 1}`} className="absolute right-1 top-1 grid size-5 place-items-center rounded-md bg-black/65 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" onClick={() => controller.toggleReferenceAsset(item.id)}><Trash2 className="size-3" /></button>
                  <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-0.5 font-mono text-[9px] text-white">{index + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void controller.openReferenceLibrary()}
              className="flex min-h-14 w-full items-center justify-between gap-2.5 rounded-xl border border-dashed border-border/80 bg-surface-muted/50 px-3 py-2.5 text-left text-muted-foreground transition-colors hover:border-foreground/35 hover:bg-surface-hover hover:text-foreground"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface text-muted-foreground shadow-2xs">
                  <Images className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">选择人物、服装或场景参考图</p>
                  <p className="truncate text-[10px] text-muted-foreground">最多勾选 7 张资产保持角色一致性</p>
                </div>
              </div>
              <span className="shrink-0 rounded-lg border border-border/75 bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs">
                打开资产库
              </span>
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
