"use client";

import { ImagePageContentView } from "@/app/image/components/image-page-content-view";
import { ImagePageShell } from "@/app/image/components/image-page-shell";
import { useImagePageController } from "@/app/image/hooks/use-image-page-controller";
import { buildImagePageContentViewProps } from "@/app/image/lib/image-page-content-view-props";

function ImagePageContent() {
  const controller = useImagePageController();
  return <ImagePageContentView {...buildImagePageContentViewProps(controller)} />;
}

export default function ImagePage() {
  return (
    <ImagePageShell>
      <ImagePageContent />
    </ImagePageShell>
  );
}
