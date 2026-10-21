"use client";

import { Film, Library, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { useVideoCreation } from "@/app/video/use-video-creation";
import { VideoForm } from "@/app/video/video-form";
import { VideoReferenceLibraryDialog } from "@/app/video/video-reference-library-dialog";
import { VideoResult } from "@/app/video/video-result";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
import { Button } from "@/components/ui/button";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function VideoPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/video");
  const controller = useVideoCreation(session);

  if (isCheckingAuth || !session) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }

  return (
    <section className="space-y-4 py-3 sm:py-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"><Film className="size-3.5" />Grok Imagine 视频工作台</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">视频创作</h1>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-lg"><Link to="/video-library"><Library className="size-4" />视频库</Link></Button>
      </header>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(350px,0.72fr)_minmax(0,1.28fr)]">
        <VideoForm controller={controller} />
        <VideoResult controller={controller} />
      </div>
      <VideoPreviewDialog
        variant="studio"
        video={controller.previewVideo}
        downloadName={controller.previewVideo ? `grok-video-${controller.previewVideo.taskID}.mp4` : undefined}
        onOpenChange={(open) => { if (!open) controller.closePreview(); }}
      />
      <VideoReferenceLibraryDialog controller={controller} />
    </section>
  );
}
