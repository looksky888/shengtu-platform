import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { VideoCreationController } from "./use-video-creation";

export function VideoPreviewDialog({ controller }: { controller: VideoCreationController }) {
  const preview = controller.previewVideo;
  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) controller.closePreview(); }}>
      <DialogContent className="max-h-[94vh] w-[min(94vw,1080px)] max-w-none overflow-y-auto border-white/10 bg-[#090b10] p-4 text-white shadow-[0_40px_140px_-45px_rgba(0,0,0,0.95)] sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-white">视频预览</DialogTitle>
          <DialogDescription className="line-clamp-2 text-white/45">{preview?.prompt || "本次生成的视频"}</DialogDescription>
        </DialogHeader>
        {preview ? <div className="space-y-4"><div className="flex min-h-[50vh] items-center justify-center overflow-hidden rounded-[18px] bg-black"><video controls autoPlay preload="metadata" src={preview.url} className="max-h-[74vh] max-w-full">您的浏览器不支持视频播放。</video></div><div className="flex flex-wrap items-center gap-3"><Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><a href={preview.url} download={`grok-video-${preview.taskID}.mp4`}><Download />下载视频</a></Button><span className="text-xs text-white/40">{preview.seconds} 秒 · {preview.resolutionName} · {preview.size}</span></div></div> : null}
      </DialogContent>
    </Dialog>
  );
}
