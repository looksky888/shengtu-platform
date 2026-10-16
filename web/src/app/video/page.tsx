"use client";

import { Film, Library, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { useVideoCreation } from "@/app/video/use-video-creation";
import { VideoForm } from "@/app/video/video-form";
import { VideoPreviewDialog } from "@/app/video/video-preview-dialog";
import { VideoReferenceLibraryDialog } from "@/app/video/video-reference-library-dialog";
import { VideoResult } from "@/app/video/video-result";
import { Button } from "@/components/ui/button";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function VideoPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/video");
  const controller = useVideoCreation(session);

  if (isCheckingAuth || !session) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }

  return (
    <section className="space-y-4 py-3 sm:py-5">
      <header className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1456f0]"><Film className="size-3.5" />Grok Imagine</p>
          <h1 className="font-display mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">视频创作</h1>
        </div>
        <Button asChild variant="outline" className="rounded-full bg-background/80 backdrop-blur"><Link to="/video-library"><Library />视频库</Link></Button>
      </header>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(350px,0.72fr)_minmax(0,1.28fr)]">
        <VideoForm controller={controller} />
        <VideoResult controller={controller} />
      </div>
      <VideoPreviewDialog controller={controller} />
      <VideoReferenceLibraryDialog controller={controller} />
    </section>
  );
}
