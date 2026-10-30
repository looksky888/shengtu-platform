import { Suspense, type ComponentProps } from "react";

import { ImageComposer } from "@/app/image/components/image-composer";
import { ImageDeleteConfirmDialog } from "@/app/image/components/image-delete-confirm-dialog";
import type { ImageEditDialog } from "@/app/image/components/edit-dialog/image-edit-dialog";
import type { ImageHistoryDialog } from "@/app/image/components/image-history-dialog";
import type { ImageInpaintDialog } from "@/app/image/components/image-inpaint-dialog";
import { ImagePageWorkspace } from "@/app/image/components/image-page-workspace";
import { ImageResults } from "@/app/image/components/image-results";
import type { ImageLightbox } from "@/components/image-lightbox";
import { lazyWithRetry } from "@/lib/lazy-with-retry";

const LazyImageHistoryDialog = lazyWithRetry(() =>
  import("@/app/image/components/image-history-dialog").then((mod) => ({
    default: mod.ImageHistoryDialog,
  })),
);

const LazyImageEditDialog = lazyWithRetry(() =>
  import("@/app/image/components/edit-dialog/image-edit-dialog").then((mod) => ({
    default: mod.ImageEditDialog,
  })),
);

const LazyImageInpaintDialog = lazyWithRetry(() =>
  import("@/app/image/components/image-inpaint-dialog").then((mod) => ({
    default: mod.ImageInpaintDialog,
  })),
);

const LazyImageLightbox = lazyWithRetry(() =>
  import("@/components/image-lightbox").then((mod) => ({
    default: mod.ImageLightbox,
  })),
);

type WorkspaceProps = Omit<ComponentProps<typeof ImagePageWorkspace>, "overlays" | "results" | "composer">;

export type ImagePageContentViewProps = {
  workspaceProps: WorkspaceProps;
  historyDialogProps: ComponentProps<typeof ImageHistoryDialog>;
  editDialogProps: ComponentProps<typeof ImageEditDialog>;
  inpaintDialogProps: ComponentProps<typeof ImageInpaintDialog>;
  resultsProps: ComponentProps<typeof ImageResults>;
  composerProps: ComponentProps<typeof ImageComposer>;
  lightboxProps: ComponentProps<typeof ImageLightbox>;
  deleteConfirmDialogProps: ComponentProps<typeof ImageDeleteConfirmDialog>;
};

export function ImagePageContentView({
  workspaceProps,
  historyDialogProps,
  editDialogProps,
  inpaintDialogProps,
  resultsProps,
  composerProps,
  lightboxProps,
  deleteConfirmDialogProps,
}: ImagePageContentViewProps) {
  return (
    <>
      <ImagePageWorkspace
        {...workspaceProps}
        overlays={
          <Suspense fallback={null}>
            {historyDialogProps.open ? (
              <LazyImageHistoryDialog {...historyDialogProps} />
            ) : null}
            {editDialogProps.draft ? (
              <LazyImageEditDialog {...editDialogProps} />
            ) : null}
            {inpaintDialogProps.source ? (
              <LazyImageInpaintDialog {...inpaintDialogProps} />
            ) : null}
          </Suspense>
        }
        results={<ImageResults {...resultsProps} />}
        composer={<ImageComposer {...composerProps} />}
      />

      {lightboxProps.open ? (
        <Suspense fallback={null}>
          <LazyImageLightbox {...lightboxProps} />
        </Suspense>
      ) : null}
      <ImageDeleteConfirmDialog {...deleteConfirmDialogProps} />
    </>
  );
}
