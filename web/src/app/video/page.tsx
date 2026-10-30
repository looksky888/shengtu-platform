"use client";

import { LoaderCircle } from "lucide-react";

import { useVideoCreation } from "@/app/video/use-video-creation";
import { VideoReferenceLibraryDialog } from "@/app/video/video-reference-library-dialog";
import { VideoWorkspace } from "@/app/video/video-workspace";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function VideoPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/video");
  const controller = useVideoCreation(session);

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <VideoWorkspace controller={controller} />
      <VideoPreviewDialog
        variant="studio"
        video={controller.previewVideo}
        downloadName={
          controller.previewVideo
            ? `grok-video-${controller.previewVideo.taskID}.mp4`
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) controller.closePreview();
        }}
      />
      <VideoReferenceLibraryDialog controller={controller} />
    </>
  );
}
