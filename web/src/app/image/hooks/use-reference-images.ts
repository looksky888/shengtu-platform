import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";

import type { ComposerMode, EditingTurnDraft } from "@/app/image/lib/image-page-types";
import { buildReferenceImageFromStoredImage, readFileAsDataUrl } from "@/app/image/lib/reference-image-utils";
import type { StoredImage, StoredReferenceImage } from "@/store/image-conversations";

type UseReferenceImagesOptions = {
  setSelectedConversationId: Dispatch<SetStateAction<string | null>>;
  setComposerMode: Dispatch<SetStateAction<ComposerMode>>;
  setImagePrompt: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  setEditingTurnDraft: Dispatch<SetStateAction<EditingTurnDraft | null>>;
  cancelPromptApplyRequest: () => void;
};

function clearFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = "";
  }
}

async function filesToReferenceImages(files: File[]) {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || "image/png",
      dataUrl: await readFileAsDataUrl(file),
      source: "upload" as const,
    })),
  );
}

export function useReferenceImages({
  setSelectedConversationId,
  setComposerMode,
  setImagePrompt,
  textareaRef,
  setEditingTurnDraft,
  cancelPromptApplyRequest,
}: UseReferenceImagesOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [referenceImages, setReferenceImages] = useState<StoredReferenceImage[]>([]);

  const clearReferenceImages = useCallback(() => {
    setReferenceImages([]);
    clearFileInput(fileInputRef.current);
  }, []);

  const appendReferenceImages = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      cancelPromptApplyRequest();

      try {
        const previews = await filesToReferenceImages(files);
        setComposerMode("image");
        setReferenceImages((prev) => [...prev, ...previews]);
        clearFileInput(fileInputRef.current);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取参考图失败";
        toast.error(message);
      }
    },
    [cancelPromptApplyRequest, setComposerMode],
  );

  const handleReferenceImageChange = useCallback(
    async (files: File[]) => {
      await appendReferenceImages(files);
    },
    [appendReferenceImages],
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setReferenceImages((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      if (next.length === 0) {
        clearFileInput(fileInputRef.current);
      }
      return next;
    });
  }, []);

  const handleContinueEdit = useCallback(
    async (conversationId: string, image: StoredImage | StoredReferenceImage) => {
      try {
        const nextReference =
          "dataUrl" in image
            ? { referenceImage: image }
            : await buildReferenceImageFromStoredImage(image, `conversation-${conversationId}-${Date.now()}.png`);
        if (!nextReference) {
          return;
        }

        setSelectedConversationId(conversationId);
        setComposerMode("image");
        setReferenceImages((prev) => [
          ...prev,
          {
            ...nextReference.referenceImage,
            source: "conversation",
          },
        ]);
        setImagePrompt("");
        textareaRef.current?.focus();
        toast.success("已加入当前参考图，继续输入描述即可编辑");
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取结果图失败";
        toast.error(message);
      }
    },
    [setComposerMode, setImagePrompt, setSelectedConversationId, textareaRef],
  );

  const handleEditReferenceImageChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      try {
        const previews = await filesToReferenceImages(files);
        setEditingTurnDraft((current) =>
          current
            ? {
                ...current,
                referenceImages: [...current.referenceImages, ...previews],
              }
            : current,
        );
        clearFileInput(editFileInputRef.current);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取参考图失败";
        toast.error(message);
      }
    },
    [setEditingTurnDraft],
  );

  const handleRemoveEditReferenceImage = useCallback(
    (index: number) => {
      setEditingTurnDraft((current) =>
        current
          ? {
              ...current,
              referenceImages: current.referenceImages.filter((_, currentIndex) => currentIndex !== index),
            }
          : current,
      );
    },
    [setEditingTurnDraft],
  );

  return {
    fileInputRef,
    editFileInputRef,
    referenceImages,
    setReferenceImages,
    clearReferenceImages,
    appendReferenceImages,
    handleReferenceImageChange,
    handleRemoveReferenceImage,
    handleContinueEdit,
    handleEditReferenceImageChange,
    handleRemoveEditReferenceImage,
  };
}
