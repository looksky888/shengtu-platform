"use client";

import { useRef, useState } from "react";

import { ImageResultsEmptyState } from "@/app/image/components/image-results-empty-state";
import { ImageTurnResultsBlock } from "@/app/image/components/image-turn-results-block";
import type { DownloadableImage, ImageLightboxItem } from "@/app/image/components/image-results-types";
import { downloadImage, downloadImages, fetchImageSizeLabel, formatImageDimensions, turnProgressKey } from "@/app/image/components/image-results-utils";
import type { ImagePromptPreset } from "@/app/image/image-presets";
import type { ImageVisibility } from "@/lib/api";
import { isImageDownloadCanceled, MAX_IMAGE_BATCH_DOWNLOAD_ITEMS } from "@/lib/image-download";
import { toast } from "sonner";
import type { ImageConversation, StoredImage, StoredReferenceImage } from "@/store/image-conversations";
import type { ImageTurnProgress } from "@/store/image-turn-progress";

export type { ImageLightboxItem } from "@/app/image/components/image-results-types";

type ImageResultsProps = {
  selectedConversation: ImageConversation | null;
  progressByTurnKey: Record<string, ImageTurnProgress>;
  progressNow: number;
  promptPresets: readonly ImagePromptPreset[];
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onApplyPromptPreset: (preset: ImagePromptPreset) => void | Promise<void>;
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
  visibilityMutatingImageKey: string;
  formatConversationTime: (value: string) => string;
};

export function ImageResults({
  selectedConversation,
  progressByTurnKey,
  progressNow,
  promptPresets,
  onOpenLightbox,
  onApplyPromptPreset,
  onContinueEdit,
  onLocalEdit,
  onEditTurn,
  onCancelTurn,
  onRegenerateTurn,
  onDeleteTurn,
  onRetryImage,
  onImageVisibilityChange,
  visibilityMutatingImageKey,
  formatConversationTime,
}: ImageResultsProps) {
  const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});
  const [imageSizeLabels, setImageSizeLabels] = useState<Record<string, string>>({});
  const [selectedImageIds, setSelectedImageIds] = useState<Record<string, boolean>>({});
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const pendingImageSizeIdsRef = useRef<Set<string>>(new Set());

  const updateImageDimensions = (id: string, width: number, height: number) => {
    const dimensions = formatImageDimensions(width, height);
    setImageDimensions((current) => {
      if (current[id] === dimensions) {
        return current;
      }
      return { ...current, [id]: dimensions };
    });
  };

  const toggleImageSelection = (selectionKey: string) => {
    setSelectedImageIds((current) => ({
      ...current,
      [selectionKey]: !current[selectionKey],
    }));
  };

  const updateImageSizeLabel = (id: string, sizeLabel: string) => {
    if (!sizeLabel) {
      return;
    }
    setImageSizeLabels((current) => {
      if (current[id] === sizeLabel) {
        return current;
      }
      return { ...current, [id]: sizeLabel };
    });
  };

  const ensureImageSizeLabel = (id: string, src: string) => {
    if (imageSizeLabels[id] || pendingImageSizeIdsRef.current.has(id)) {
      return;
    }

    pendingImageSizeIdsRef.current.add(id);
    void fetchImageSizeLabel(src)
      .then((sizeLabel) => updateImageSizeLabel(id, sizeLabel))
      .finally(() => {
        pendingImageSizeIdsRef.current.delete(id);
      });
  };

  const downloadItems = async (key: string, items: DownloadableImage[]) => {
    if (items.length === 0 || downloadingKey) {
      return;
    }
    if (items.length > MAX_IMAGE_BATCH_DOWNLOAD_ITEMS) {
      toast.error(`单次最多下载 ${MAX_IMAGE_BATCH_DOWNLOAD_ITEMS} 张图片`);
      return;
    }

	setDownloadingKey(key);
	const toastId = `image-download:${key}`;
	try {
		if (items.length === 1) {
			await downloadImage(items[0]);
			toast.success("图片已开始下载", { id: toastId });
		} else {
			toast.loading("请选择保存文件夹，随后将逐张写入原图", { id: toastId });
			const result = await downloadImages(items);
			if (result.failed.length > 0) {
				toast.error(`已处理 ${result.total} 张：成功 ${result.completed} 张，失败 ${result.failed.length} 张`, { id: toastId });
			} else {
				toast.success(
					result.mode === "directory"
						? `已保存 ${result.completed} 张原图`
						: `已提交 ${result.completed} 张原图下载`,
					{ id: toastId },
				);
			}
		}
	} catch (error) {
		if (isImageDownloadCanceled(error)) {
			toast.info("已取消选择保存文件夹", { id: toastId });
		} else {
			toast.error(error instanceof Error ? error.message : "下载图片失败", { id: toastId });
		}
	} finally {
      setDownloadingKey(null);
    }
  };

  if (!selectedConversation || selectedConversation.turns.length === 0) {
    return <ImageResultsEmptyState promptPresets={promptPresets} onApplyPromptPreset={onApplyPromptPreset} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 sm:gap-8">
      {selectedConversation.turns.map((turn, turnIndex) => {
        const progress = progressByTurnKey[turnProgressKey(selectedConversation.id, turn.id)];

        return (
          <ImageTurnResultsBlock
            key={turn.id}
            conversationId={selectedConversation.id}
            turn={turn}
            turnIndex={turnIndex}
            progress={progress}
            progressNow={progressNow}
            imageDimensions={imageDimensions}
            imageSizeLabels={imageSizeLabels}
            selectedImageIds={selectedImageIds}
            downloadingKey={downloadingKey}
            visibilityMutatingImageKey={visibilityMutatingImageKey}
            formatConversationTime={formatConversationTime}
            onOpenLightbox={onOpenLightbox}
            onContinueEdit={onContinueEdit}
            onLocalEdit={onLocalEdit}
            onEditTurn={onEditTurn}
            onCancelTurn={onCancelTurn}
            onRegenerateTurn={onRegenerateTurn}
            onDeleteTurn={onDeleteTurn}
            onRetryImage={onRetryImage}
            onImageVisibilityChange={onImageVisibilityChange}
            onToggleImageSelection={toggleImageSelection}
            onUpdateImageDimensions={updateImageDimensions}
            onEnsureImageSizeLabel={ensureImageSizeLabel}
            onDownloadItems={(key, items) => void downloadItems(key, items)}
          />
        );
      })}
    </div>
  );
}

