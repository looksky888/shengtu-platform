import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { videoDownloadURL, type VideoAsset } from "@/lib/video-task-api";

export function VideoPreviewDialog({
  asset,
  onOpenChange,
}: {
  asset: VideoAsset | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(asset)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>视频预览</DialogTitle>
          <DialogDescription>{asset?.prompt || "未记录提示词"}</DialogDescription>
        </DialogHeader>
        {asset ? (
          <div className="space-y-4">
            <video controls autoPlay preload="metadata" src={asset.url} className="max-h-[70vh] w-full rounded-[16px] bg-black">
              您的浏览器不支持视频播放。
            </video>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline"><a href={videoDownloadURL(asset)} download><Download />下载视频</a></Button>
              <span className="text-xs text-muted-foreground">{asset.seconds || "—"} 秒 · {asset.resolution_name || "—"} · {asset.size || "—"}</span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
