import { Check, ImagePlus, Images, LoaderCircle, Search, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { VideoCreationController } from "./use-video-creation";

const acceptedTypes = "image/png,image/jpeg,image/webp,image/gif";

export function VideoReferenceLibraryDialog({ controller }: { controller: VideoCreationController }) {
  const picker = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const assets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? controller.referenceAssets.filter((item) => item.name.toLowerCase().includes(keyword)) : controller.referenceAssets;
  }, [controller.referenceAssets, query]);

  useEffect(() => {
    if (controller.referenceLibraryOpen) {
      setDraftSelection(controller.selectedReferenceAssetIds);
    }
  }, [controller.referenceLibraryOpen, controller.selectedReferenceAssetIds]);

  useEffect(() => {
    const available = new Set(controller.referenceAssets.map((asset) => asset.id));
    setDraftSelection((current) => current.filter((id) => available.has(id)));
  }, [controller.referenceAssets]);

  function toggleDraft(id: string) {
    setDraftSelection((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 7) {
        toast.error("参考图片最多选择 7 张");
        return current;
      }
      return [...current, id];
    });
  }

  function confirmSelection() {
    controller.setSelectedReferenceAssets(draftSelection);
    controller.setReferenceLibraryOpen(false);
  }

  return (
    <Dialog open={controller.referenceLibraryOpen} onOpenChange={controller.setReferenceLibraryOpen}>
      <DialogContent className="grid h-[min(86dvh,780px)] w-[min(94vw,1040px)] max-w-none grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="min-w-0 border-b border-slate-200 px-5 py-5 pr-14 dark:border-white/10 sm:px-6">
          <DialogTitle className="flex items-center gap-2"><Images className="size-5 text-[#1456f0]" />参考图资产库</DialogTitle>
          <DialogDescription>上传常用人物、服装和场景图片，勾选后用于本次视频生成。最多选择 7 张。</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-white/10 dark:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产名称" className="h-10 rounded-[12px] bg-background pl-9" />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">已选 {draftSelection.length}/7</span>
            <input ref={picker} type="file" multiple accept={acceptedTypes} className="hidden" onChange={(event) => { void controller.uploadReferences(Array.from(event.target.files || [])); event.target.value = ""; }} />
            <Button type="button" variant="outline" className="rounded-[12px]" disabled={controller.uploadingReferences} onClick={() => picker.current?.click()}>
              {controller.uploadingReferences ? <LoaderCircle className="animate-spin" /> : <UploadCloud />}上传图片
            </Button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6">
          {controller.referenceLibraryLoading ? (
            <div className="grid h-full min-h-56 place-items-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-[#1456f0]" />正在读取资产库</div></div>
          ) : assets.length ? (
            <div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {assets.map((asset) => {
                const selected = draftSelection.includes(asset.id);
                return (
                  <figure key={asset.id} className={cn("group relative overflow-hidden rounded-[16px] border bg-slate-100 transition duration-200 dark:bg-white/[0.04]", selected ? "border-[#1456f0] ring-2 ring-[#1456f0]/20" : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_34px_-24px_rgba(20,86,240,0.65)] dark:border-white/10")}>
                    <button type="button" className="block aspect-square w-full overflow-hidden text-left" aria-pressed={selected} aria-label={`${selected ? "取消选择" : "选择"}${asset.name}`} onClick={() => toggleDraft(asset.id)}>
                      <img src={asset.url} alt={asset.name} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.025]" />
                      <span className={cn("absolute left-2 top-2 grid size-7 place-items-center rounded-full border shadow-sm transition", selected ? "border-[#1456f0] bg-[#1456f0] text-white" : "border-white/90 bg-black/25 text-transparent group-hover:bg-black/40")}><Check className="size-4" /></span>
                    </button>
                    <figcaption className="flex items-center gap-2 bg-background/96 px-3 py-2.5">
                      <p className="min-w-0 flex-1 truncate text-xs font-medium" title={asset.name}>{asset.name}</p>
                      <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label={`删除${asset.name}`} onClick={() => void controller.removeReferenceAsset(asset.id)}><Trash2 className="size-3.5" /></button>
                    </figcaption>
                  </figure>
                );
                })}
              </div>
              {controller.referenceAssetsHasMore && !query.trim() ? <div className="mt-5 flex justify-center"><Button type="button" variant="outline" className="rounded-[12px]" disabled={controller.referenceAssetsLoadingMore} onClick={() => void controller.loadMoreReferenceAssets()}>{controller.referenceAssetsLoadingMore ? <LoaderCircle className="animate-spin" /> : null}加载更多参考图</Button></div> : null}
            </div>
          ) : (
            <button type="button" className="flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-slate-300 bg-slate-50/60 px-6 text-center transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-white/15 dark:bg-white/[0.025] dark:hover:bg-white/[0.04]" onClick={() => picker.current?.click()}>
              <span className="grid size-12 place-items-center rounded-[15px] bg-white text-[#1456f0] shadow-sm dark:bg-white/10"><ImagePlus className="size-5" /></span>
              <span><strong className="block text-sm">上传第一张参考图片</strong><span className="mt-1 block text-xs text-muted-foreground">PNG、JPEG、WebP 或 GIF，单张最大 20MB</span></span>
            </button>
          )}
        </div>

        <DialogFooter className="min-w-0 border-t border-slate-200 bg-background px-5 py-4 dark:border-white/10 sm:px-6">
          <Button type="button" variant="outline" className="rounded-[12px]" onClick={() => controller.setReferenceLibraryOpen(false)}>取消</Button>
          <Button type="button" className="rounded-[12px] bg-[#1456f0] hover:bg-[#0f49cf]" onClick={confirmSelection}>使用已选图片（{draftSelection.length}）</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
