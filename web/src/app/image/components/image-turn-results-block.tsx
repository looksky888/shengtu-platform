import { ImageTextReplies } from "@/app/image/components/image-text-replies";
import { ImageTurnPromptCard } from "@/app/image/components/image-turn-prompt-card";
import { ImageTurnResultSummary } from "@/app/image/components/image-turn-result-summary";
import { ImageVisualResultGrid } from "@/app/image/components/image-visual-result-grid";
import type { DownloadableImage, ImageLightboxItem } from "@/app/image/components/image-results-types";
import {
  buildDownloadName,
  getStoredImageSrc,
  getTurnOutcomeLabel,
  getTurnResultSizeLabel,
  imageSelectionKey,
} from "@/app/image/components/image-results-utils";
import type { ImageVisibility } from "@/lib/api";
import { formatElapsedClock } from "@/lib/datetime";
import { formatBase64ImageFileSize } from "@/lib/image-size";
import { isTurnBusy } from "@/lib/image-turn-state";
import type { ImageTurn, StoredImage, StoredReferenceImage } from "@/store/image-conversations";
import type { ImageTurnProgress } from "@/store/image-turn-progress";

type ImageTurnResultsBlockProps = {
  conversationId: string;
  turn: ImageTurn;
  turnIndex: number;
  progress?: ImageTurnProgress;
  progressNow: number;
  imageDimensions: Record<string, string>;
  imageSizeLabels: Record<string, string>;
  selectedImageIds: Record<string, boolean>;
  downloadingKey: string | null;
  visibilityMutatingImageKey: string;
  formatConversationTime: (value: string) => string;
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onContinueEdit: (conversationId: string, image: StoredImage | StoredReferenceImage) => void;
  onLocalEdit: (conversationId: string, image: StoredImage) => void;
  onEditTurn: (conversationId: string, turnId: string) => void;
  onCancelTurn: (conversationId: string, turnId: string) => void | Promise<void>;
  onRegenerateTurn: (conversationId: string, turnId: string) => void | Promise<void>;
  onDeleteTurn: (conversationId: string, turnId: string, prompt: string) => void;
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

export function ImageTurnResultsBlock({
  conversationId,
  turn,
  turnIndex,
  progress,
  progressNow,
  imageDimensions,
  imageSizeLabels,
  selectedImageIds,
  downloadingKey,
  visibilityMutatingImageKey,
  formatConversationTime,
  onOpenLightbox,
  onContinueEdit,
  onLocalEdit,
  onEditTurn,
  onCancelTurn,
  onRegenerateTurn,
  onDeleteTurn,
  onRetryImage,
  onImageVisibilityChange,
  onToggleImageSelection,
  onUpdateImageDimensions,
  onEnsureImageSizeLabel,
  onDownloadItems,
}: ImageTurnResultsBlockProps) {
  const turnBusy = isTurnBusy(turn);
  const referenceLightboxImages = turn.referenceImages.map((image, index) => ({
    id: `${turn.id}-reference-${index}`,
    src: image.dataUrl,
    downloadName: image.name,
  }));
  const downloadableImages = buildDownloadableImages(conversationId, turn);
  const selectedDownloadableImages = downloadableImages.filter((image) => selectedImageIds[image.selectionKey]);
  const successfulTurnImages = buildSuccessfulTurnImages(turn, imageDimensions, imageSizeLabels);
  const textReplyImages = turn.images
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => image.status === "message" && Boolean(image.text_response));
  const visualImages = turn.images
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => !textReplyImages.some((reply) => reply.image.id === image.id));
  const successCount = visualImages.filter(({ image }) => image.status === "success").length;
  const failedCount = visualImages.filter(({ image }) => image.status === "error").length;
  const cancelledCount = visualImages.filter(({ image }) => image.status === "cancelled").length;
  const resultCount = visualImages.length || (turnBusy ? turn.count : 0);
  const progressStartedAt = progress && Number.isFinite(progress.startedAt) ? progress.startedAt : null;
  const elapsedClock =
    turnBusy && progressStartedAt !== null
      ? formatElapsedClock(Math.max(0, Math.floor((progressNow - progressStartedAt) / 1000)))
      : "";
  const progressMessage =
    progress?.message || (turn.status === "queued" ? "等待前序任务" : turnBusy ? "正在处理图片" : "");
  const selectedDownloadKey = `selected:${conversationId}:${turn.id}`;
  const allDownloadKey = `all:${conversationId}:${turn.id}`;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <ImageTurnPromptCard
        conversationId={conversationId}
        turn={turn}
        turnIndex={turnIndex}
        turnBusy={turnBusy}
        referenceLightboxImages={referenceLightboxImages}
        formatConversationTime={formatConversationTime}
        onOpenLightbox={onOpenLightbox}
        onEditTurn={onEditTurn}
        onCancelTurn={onCancelTurn}
        onRegenerateTurn={onRegenerateTurn}
        onDeleteTurn={onDeleteTurn}
      />

      <div className="flex justify-start">
        <section className="w-full px-1">
          <ImageTurnResultSummary
            turn={turn}
            turnBusy={turnBusy}
            resultCount={resultCount}
            resultSizeLabel={getTurnResultSizeLabel(turn, imageDimensions)}
            outcomeLabel={getTurnOutcomeLabel(successCount, failedCount, cancelledCount)}
            progressMessage={progressMessage}
            downloadableImages={downloadableImages}
            selectedDownloadableImages={selectedDownloadableImages}
            downloadingKey={downloadingKey}
            selectedDownloadKey={selectedDownloadKey}
            allDownloadKey={allDownloadKey}
            onDownloadItems={onDownloadItems}
          />

          <ImageTextReplies
            conversationId={conversationId}
            turn={turn}
            turnBusy={turnBusy}
            textReplyImages={textReplyImages}
            onRetryImage={onRetryImage}
          />

          <ImageVisualResultGrid
            conversationId={conversationId}
            turn={turn}
            turnBusy={turnBusy}
            visualImages={visualImages}
            successfulTurnImages={successfulTurnImages}
            downloadableImages={downloadableImages}
            downloadingKey={downloadingKey}
            selectedImageIds={selectedImageIds}
            imageDimensions={imageDimensions}
            imageSizeLabels={imageSizeLabels}
            visibilityMutatingImageKey={visibilityMutatingImageKey}
            elapsedClock={elapsedClock}
            onOpenLightbox={onOpenLightbox}
            onContinueEdit={onContinueEdit}
            onLocalEdit={onLocalEdit}
            onRetryImage={onRetryImage}
            onImageVisibilityChange={onImageVisibilityChange}
            onToggleImageSelection={onToggleImageSelection}
            onUpdateImageDimensions={onUpdateImageDimensions}
            onEnsureImageSizeLabel={onEnsureImageSizeLabel}
            onDownloadItems={onDownloadItems}
          />
        </section>
      </div>
    </div>
  );
}

function buildDownloadableImages(conversationId: string, turn: ImageTurn): DownloadableImage[] {
  return turn.images.flatMap((image, index) => {
    const src = image.status === "success" ? getStoredImageSrc(image) : "";
    return src
      ? [
          {
            id: image.id,
            selectionKey: imageSelectionKey(conversationId, turn.id, image.id),
            src,
            path: image.path,
            fileName: buildDownloadName(turn.createdAt, turn.id, index, image.outputFormat || turn.outputFormat),
            imageIndex: index,
          },
        ]
      : [];
  });
}

function buildSuccessfulTurnImages(
  turn: ImageTurn,
  imageDimensions: Record<string, string>,
  imageSizeLabels: Record<string, string>,
): ImageLightboxItem[] {
  return turn.images.flatMap((image, index) => {
    const src = image.status === "success" ? getStoredImageSrc(image) : "";
    return src
      ? [
          {
            id: image.id,
            src,
            downloadName: buildDownloadName(turn.createdAt, turn.id, index, image.outputFormat || turn.outputFormat),
            sizeLabel: image.b64_json ? formatBase64ImageFileSize(image.b64_json) : imageSizeLabels[image.id],
            dimensions: imageDimensions[image.id],
          },
        ]
      : [];
  });
}
