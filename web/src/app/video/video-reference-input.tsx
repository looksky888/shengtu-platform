import { ImageIcon, Images, Link2, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { VideoCreationController } from "./use-video-creation";

const acceptedTypes = "image/png,image/jpeg,image/webp,image/gif";

export function VideoReferenceInput({ controller }: { controller: VideoCreationController }) {
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showURL, setShowURL] = useState(Boolean(controller.inputReference));
  const uploaded = controller.uploadedReference;

  function uploadDroppedFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void controller.uploadReference(file);
  }

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-tight text-foreground">首帧参考</h2>
        <span className="text-[11px] text-muted-foreground">可选</span>
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
        <div className="group relative overflow-hidden rounded-lg border border-border/70 bg-zinc-950">
          <img src={uploaded.preview_url} alt="已上传的首帧图片" className="h-32 w-full object-contain" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10 text-white">
            <div className="min-w-0"><p className="truncate text-xs font-medium">{uploaded.filename || "首帧图片"}</p><p className="mt-0.5 text-[10px] text-white/60">{formatBytes(uploaded.size_bytes)} · 将作为第一帧</p></div>
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
            "flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-muted/25 px-4 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            dragging
              ? "border-primary bg-primary/10 text-primary"
              : "border-border/80 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
          )}
          onClick={() => picker.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") picker.current?.click(); }}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={uploadDroppedFile}
        >
          {controller.uploadingReference ? <LoaderCircle className="size-5 animate-spin text-primary" /> : <ImageIcon className="size-5" />}
          <div><p className="text-xs font-medium text-foreground">{controller.uploadingReference ? "正在上传" : "点击或拖拽上传图片"}</p><p className="mt-0.5 text-[11px]">PNG、JPEG、WebP、GIF，最大 20MB</p></div>
        </div>
      )}
      {!uploaded ? (
        <div className="space-y-2">
          <button type="button" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary" onClick={() => setShowURL((value) => !value)}><Link2 className="size-3.5" />{showURL ? "收起图片链接" : "通过图片链接添加"}</button>
          {showURL ? <Input value={controller.inputReference} onChange={(event) => controller.setInputReferenceURL(event.target.value)} placeholder="https://example.com/first-frame.jpg" className="h-9 rounded-lg" /> : null}
        </div>
      ) : null}

      <div className="space-y-2.5 border-t border-border/70 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-xs font-semibold tracking-tight text-foreground">内容与风格参考</h2><p className="mt-0.5 text-[11px] text-muted-foreground">人物、服装、场景等，最多 7 张</p></div>
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{controller.selectedReferenceAssetIds.length}/7</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-5">
          {controller.referenceAssets.filter((item) => controller.selectedReferenceAssetIds.includes(item.id)).map((item, index) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-zinc-950">
              <img src={item.url} alt={`参考图片 ${index + 1}`} className="h-full w-full object-cover" />
              <button type="button" aria-label={`移除参考图片 ${index + 1}`} className="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-black/65 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" onClick={() => controller.toggleReferenceAsset(item.id)}><Trash2 className="size-3.5" /></button>
              <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] text-white">{index + 1}</span>
            </div>
          ))}
          <button type="button" className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/80 bg-muted/20 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary" onClick={() => void controller.openReferenceLibrary()}><Images className="size-4" /><span>打开资产库</span></button>
        </div>
      </div>
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
