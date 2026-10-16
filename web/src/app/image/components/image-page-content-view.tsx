import type { ComponentProps } from "react";

import { ImageComposer } from "@/app/image/components/image-composer";
import { ImageDeleteConfirmDialog } from "@/app/image/components/image-delete-confirm-dialog";
import { ImageEditDialog } from "@/app/image/components/edit-dialog/image-edit-dialog";
import { ImageHistoryDialog } from "@/app/image/components/image-history-dialog";
import { ImageInpaintDialog } from "@/app/image/components/image-inpaint-dialog";
import { ImagePageWorkspace } from "@/app/image/components/image-page-workspace";
import { ImageResults } from "@/app/image/components/image-results";
import { StudioStatsFab } from "@/app/image/components/studio-stats-fab";
import { ImageLightbox } from "@/components/image-lightbox";

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
          <>
            <ImageHistoryDialog {...historyDialogProps} />
            <ImageEditDialog {...editDialogProps} />
            <ImageInpaintDialog {...inpaintDialogProps} />
          </>
        }
        results={<ImageResults {...resultsProps} />}
        composer={<ImageComposer {...composerProps} />}
      />

      <ImageLightbox {...lightboxProps} />
      <ImageDeleteConfirmDialog {...deleteConfirmDialogProps} />
      <StudioStatsFab />
    </>
  );
}

