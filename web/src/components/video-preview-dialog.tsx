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
        ? "max-h-[94vh] w-[min(94vw,1080px)] max-w-none overflow-y-auto border-white/10 bg-[#090b10] p-4 text-white shadow-[0_40px_140px_-45px_rgba(0,0,0,0.95)] sm:p-6"
        : "max-h-[92vh] max-w-4xl overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle className={studio ? "text-white" : undefined}>视频预览</DialogTitle>
          <DialogDescription className={studio ? "line-clamp-2 text-white/45" : undefined}>
            {video?.prompt || (studio ? "本次生成的视频" : "未记录提示词")}
          </DialogDescription>
        </DialogHeader>
        {video ? (
          <div className="space-y-4">
            <div className={studio ? "flex min-h-[50vh] items-center justify-center overflow-hidden rounded-[18px] bg-black" : undefined}>
              <video controls autoPlay preload="metadata" src={video.url} className={studio ? "max-h-[74vh] max-w-full" : "max-h-[70vh] w-full rounded-[16px] bg-black"}>
                您的浏览器不支持视频播放。
              </video>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" className={studio ? "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" : undefined}>
                <a href={videoDownloadURL(video)} download={downloadName}><Download />下载视频</a>
              </Button>
              <span className={studio ? "text-xs text-white/40" : "text-xs text-muted-foreground"}>
                {video.seconds || "—"} 秒 · {video.resolution || "—"} · {video.size || "—"}
              </span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
