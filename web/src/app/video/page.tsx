"use client";

import { LoaderCircle } from "lucide-react";

import { useVideoCreation } from "@/app/video/use-video-creation";
import { VideoForm } from "@/app/video/video-form";
import { VideoReferenceLibraryDialog } from "@/app/video/video-reference-library-dialog";
import { VideoResult } from "@/app/video/video-result";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function VideoPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/video");
  const controller = useVideoCreation(session);

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <section className="flex flex-col xl:h-[calc(100dvh-4.75rem)] xl:min-h-[600px]">
      <div className="grid min-h-0 flex-1 items-stretch gap-3.5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <VideoForm controller={controller} />
        <VideoResult controller={controller} />
      </div>
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
    </section>
  );
}
