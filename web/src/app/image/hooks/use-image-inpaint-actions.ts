import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import type { ImageInpaintSource, ImageInpaintSubmit } from "@/app/image/components/image-inpaint-dialog";
import { getStoredImageSrc } from "@/app/image/components/image-results-utils";
import { readFileAsDataUrl } from "@/app/image/lib/reference-image-utils";
import type { StoredImage, StoredReferenceImage } from "@/store/image-conversations";

import type { SubmitImageTurnOverrides } from "./use-submit-image-turn";

type UseImageInpaintActionsOptions = {
  handleSubmit: (overrides?: SubmitImageTurnOverrides) => Promise<void>;
  setSelectedConversationId: Dispatch<SetStateAction<string | null>>;
};

export function useImageInpaintActions({
  handleSubmit,
  setSelectedConversationId,
}: UseImageInpaintActionsOptions) {
  const [inpaintSource, setInpaintSource] = useState<ImageInpaintSource | null>(null);

  const handleLocalEdit = useCallback((conversationId: string, image: StoredImage) => {
    const src = getStoredImageSrc(image);
    if (!src) return;
    setInpaintSource({
      image,
      src,
      name: `局部修改-${image.id.slice(0, 8)}.png`,
    });
    setSelectedConversationId(conversationId);
  }, [setSelectedConversationId]);

  const handleInpaintSubmit = useCallback(async (payload: ImageInpaintSubmit) => {
    const source = inpaintSource;
    if (!source) return;
    const [originalDataUrl, markedDataUrl] = await Promise.all([
      readFileAsDataUrl(payload.originalFile),
      readFileAsDataUrl(payload.markedFile),
    ]);
    const requestPrompt = [
      "你会收到两张参考图：第一张是原图，第二张是带蓝色标记的原图。",
      "只修改蓝色标记覆盖的局部区域，蓝色标记不要出现在最终图片中。",
      "未标记区域尽量保持与第一张原图一致。",
      `局部修改要求：${payload.prompt}`,
    ].join("\n");
    const referenceImages: StoredReferenceImage[] = [
      { name: payload.originalFile.name, type: payload.originalFile.type || "image/png", dataUrl: originalDataUrl, source: "conversation" },
      { name: payload.markedFile.name, type: payload.markedFile.type || "image/png", dataUrl: markedDataUrl, source: "conversation" },
    ];
    await handleSubmit({ prompt: requestPrompt, composerMode: "image", referenceImages });
    setInpaintSource(null);
  }, [handleSubmit, inpaintSource]);

  return { inpaintSource, setInpaintSource, handleLocalEdit, handleInpaintSubmit };
}