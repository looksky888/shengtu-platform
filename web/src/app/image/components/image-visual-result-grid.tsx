import { ImageStatusResultCard } from "@/app/image/components/image-status-result-card";
import { ImageSuccessResultCard } from "@/app/image/components/image-success-result-card";
import type { DownloadableImage, ImageLightboxItem } from "@/app/image/components/image-results-types";
import { getStoredImageSrc, imageSelectionKey } from "@/app/image/components/image-results-utils";
import type { ImageVisibility } from "@/lib/api";
import type { ImageTurn, StoredImage, StoredReferenceImage } from "@/store/image-conversations";

type VisualImageItem = {
  image: StoredImage;
  index: number;
};

type ImageVisualResultGridProps = {
  conversationId: string;
  turn: ImageTurn;
  turnBusy: boolean;
  visualImages: VisualImageItem[];
  successfulTurnImages: ImageLightboxItem[];
  downloadableImages: DownloadableImage[];
  downloadingKey: string | null;
  selectedImageIds: Record<string, boolean>;
  imageDimensions: Record<string, string>;
  imageSizeLabels: Record<string, string>;
  visibilityMutatingImageKey: string;
  elapsedClock: string;
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onContinueEdit: (conversationId: string, image: StoredImage | StoredReferenceImage) => void;
  onLocalEdit: (conversationId: string, image: StoredImage) => void;
  onRetryImage: (conversationId: string, turnId: string, imageIndex: number) => void | Promise<void>;
  onImageVisibilityChange: (
    conversationId: string,
    turnId: string,
    imageIndex: number,
    visibility: ImageVisibility,
  ) => void | Promise<void>;
  onToggleImageSelection: (selectionKey: string) => void;
  onUpdateImageDimensions: (id: string, width: number, height: number) => void;
  onEnsureImageSizeLabel: (id: string, src: string) => void;
  onDownloadItems: (key: string, items: DownloadableImage[]) => void;
};

export function ImageVisualResultGrid({
  conversationId,
  turn,
  turnBusy,
  visualImages,
  successfulTurnImages,
  downloadableImages,
  downloadingKey,
  selectedImageIds,
  imageDimensions,
  imageSizeLabels,
  visibilityMutatingImageKey,
  elapsedClock,
  onOpenLightbox,
  onContinueEdit,
  onLocalEdit,
  onRetryImage,
  onImageVisibilityChange,
  onToggleImageSelection,
  onUpdateImageDimensions,
  onEnsureImageSizeLabel,
  onDownloadItems,
}: ImageVisualResultGridProps) {
  if (visualImages.length === 0) {
    return null;
  }

  const modelBadgeLabel = turn.modelLabel || turn.model;

  return (
    <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
      {visualImages.map(({ image, index }) => {
        const imageSrc = image.status === "success" ? getStoredImageSrc(image) : "";

        if (image.status === "success" && imageSrc) {
          const lightboxIndex = successfulTurnImages.findIndex((item) => item.id === image.id);
          const selectionKey = imageSelectionKey(conversationId, turn.id, image.id);
          const visibility = image.visibility || turn.visibility || "private";
          const visibilityMutatingKey = `${conversationId}:${turn.id}:${image.id}`;
          const singleDownloadItem = downloadableImages.find((item) => item.id === image.id);
          const singleDownloadKey = `single:${conversationId}:${turn.id}:${image.id}`;

          return (
            <ImageSuccessResultCard
              key={image.id}
              conversationId={conversationId}
              turnId={turn.id}
              prompt={turn.prompt}
              modelLabel={modelBadgeLabel}
              image={image}
              imageIndex={index}
              imageSrc={imageSrc}
              lightboxImages={successfulTurnImages}
              lightboxIndex={lightboxIndex}
              selected={Boolean(selectedImageIds[selectionKey])}
              selectionKey={selectionKey}
              imageDimensions={imageDimensions[image.id]}
              imageSizeLabel={imageSizeLabels[image.id]}
              fallbackVisibility={visibility}
              isVisibilityMutating={visibilityMutatingImageKey === visibilityMutatingKey}
              isDownloading={downloadingKey === singleDownloadKey}
              onOpenLightbox={onOpenLightbox}
              onContinueEdit={onContinueEdit}
              onLocalEdit={onLocalEdit}
              onDownload={
                singleDownloadItem
                  ? () => onDownloadItems(singleDownloadKey, [singleDownloadItem])
                  : undefined
              }
              onToggleSelection={onToggleImageSelection}
              onImageLoad={onUpdateImageDimensions}
              onEnsureImageSizeLabel={onEnsureImageSizeLabel}
              onVisibilityChange={onImageVisibilityChange}
            />
          );
        }

        return (
          <ImageStatusResultCard
            key={image.id}
            conversationId={conversationId}
            turn={turn}
            image={image}
            imageIndex={index}
            turnBusy={turnBusy}
            elapsedClock={elapsedClock}
            onRetryImage={onRetryImage}
          />
        );
      })}
    </div>
  );
}
