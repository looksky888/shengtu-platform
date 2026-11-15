import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { videoDownloadURL } from "@/lib/video-task-api";

export type VideoPreview = {
  url: string;
  prompt?: string;
  seconds?: number;
  resolution?: string;
  resolution_name?: string;
  size?: string;
};

type VideoPreviewDialogProps = {
  video: VideoPreview | null;
  onOpenChange: (open: boolean) => void;
  downloadName?: string;
};

export function VideoPreviewDialog({
  video,
  onOpenChange,
  downloadName,
}: VideoPreviewDialogProps) {
  const resolutionLabel = video?.resolution || video?.resolution_name || "—";
  return (
    <Dialog open={Boolean(video)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>视频预览</DialogTitle>
          <DialogDescription>{video?.prompt || "未记录提示词"}</DialogDescription>
        </DialogHeader>
        {video ? (
          <div className="space-y-4">
            <video
              controls
              autoPlay
              preload="metadata"
              src={video.url}
              className="max-h-[70vh] w-full rounded-[16px] bg-black"
            >
              您的浏览器不支持视频播放。
            </video>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline">
                <a href={videoDownloadURL(video)} download={downloadName}>
                  <Download />
                  下载视频
                </a>
              </Button>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {video.seconds || "—"} 秒 · {resolutionLabel} · {video.size || "—"}
              </span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
