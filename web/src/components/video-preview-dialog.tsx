import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { videoDownloadURL } from "@/lib/video-task-api";

export type VideoPreview = {
  url: string;
  prompt?: string;
  seconds?: number;
  resolution?: string;
  size?: string;
};

type VideoPreviewDialogProps = {
  video: VideoPreview | null;
  onOpenChange: (open: boolean) => void;
  /** Studio keeps the dark lightbox look; the video library uses the card styling. */
  variant?: "default" | "studio";
  downloadName?: string;
};

export function VideoPreviewDialog({ video, onOpenChange, variant = "default", downloadName }: VideoPreviewDialogProps) {
  const studio = variant === "studio";
  return (
    <Dialog open={Boolean(video)} onOpenChange={onOpenChange}>
      <DialogContent className={studio
        ? "max-h-[94vh] w-[min(94vw,1080px)] max-w-none overflow-y-auto border-zinc-800/90 bg-[#0b0b0d] p-4 text-zinc-100 shadow-[0_40px_140px_-45px_rgba(0,0,0,0.95)] sm:p-6"
        : "max-h-[92vh] max-w-4xl overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle className={studio ? "text-zinc-100" : undefined}>视频预览</DialogTitle>
          <DialogDescription className={studio ? "line-clamp-2 text-zinc-400" : undefined}>
            {video?.prompt || (studio ? "本次生成的视频" : "未记录提示词")}
          </DialogDescription>
        </DialogHeader>
        {video ? (
          <div className="space-y-4">
            <div className={studio ? "flex min-h-[50vh] items-center justify-center overflow-hidden rounded-xl border border-zinc-800/80 bg-black" : undefined}>
              <video controls autoPlay preload="metadata" src={video.url} className={studio ? "max-h-[74vh] max-w-full" : "max-h-[70vh] w-full rounded-xl bg-black"}>
                您的浏览器不支持视频播放。
              </video>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" className={studio ? "border-zinc-800 bg-zinc-900/90 text-zinc-100 hover:bg-zinc-800 hover:text-white" : undefined}>
                <a href={videoDownloadURL(video)} download={downloadName}><Download />下载视频</a>
              </Button>
              <span className={studio ? "font-mono text-xs tabular-nums text-zinc-400" : "font-mono text-xs tabular-nums text-muted-foreground"}>
                {video.seconds || "—"} 秒 · {video.resolution || "—"} · {video.size || "—"}
              </span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
