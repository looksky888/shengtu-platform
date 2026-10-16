import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";

import type { ImageAspectRatio, ImageResolution, ImageSizeMode } from "@/app/image/image-options";
import type { ComposerMode } from "@/app/image/lib/image-page-types";
import { buildComposerRecallState } from "@/app/image/lib/image-turn-recall";
import type { ImageModel, ImageOutputFormat, ImageQuality, ImageVisibility } from "@/lib/api";
import type { ImageConversation, StoredReferenceImage } from "@/store/image-conversations";

type UseImageTurnRecallActionOptions = {
  conversationsRef: RefObject<ImageConversation[]>;
  defaultImageModel: ImageModel;
  defaultTextModel: ImageModel;
  cancelPromptApplyRequest: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  setSelectedConversationId: Dispatch<SetStateAction<string | null>>;
  setComposerMode: Dispatch<SetStateAction<ComposerMode>>;
  setImagePrompt: Dispatch<SetStateAction<string>>;
  setImageModel: Dispatch<SetStateAction<ImageModel>>;
  setImageModelOptionId: Dispatch<SetStateAction<string>>;
  setImageCount: Dispatch<SetStateAction<string>>;
  setImageSizeMode: Dispatch<SetStateAction<ImageSizeMode>>;
  setImageAspectRatio: Dispatch<SetStateAction<ImageAspectRatio>>;
  setImageResolution: Dispatch<SetStateAction<ImageResolution>>;
  setImageCustomRatio: Dispatch<SetStateAction<string>>;
  setImageCustomWidth: Dispatch<SetStateAction<string>>;
  setImageCustomHeight: Dispatch<SetStateAction<string>>;
  setImageQuality: Dispatch<SetStateAction<ImageQuality>>;
  setImageOutputFormat: Dispatch<SetStateAction<ImageOutputFormat>>;
  setImageOutputCompression: Dispatch<SetStateAction<string>>;
  setDefaultImageVisibility: Dispatch<SetStateAction<ImageVisibility>>;
  setReferenceImages: Dispatch<SetStateAction<StoredReferenceImage[]>>;
};

export function useImageTurnRecallAction({
  conversationsRef,
  defaultImageModel,
  defaultTextModel,
  cancelPromptApplyRequest,
  textareaRef,
  setSelectedConversationId,
  setComposerMode,
  setImagePrompt,
  setImageModel,
  setImageModelOptionId,
  setImageCount,
  setImageSizeMode,
  setImageAspectRatio,
  setImageResolution,
  setImageCustomRatio,
  setImageCustomWidth,
  setImageCustomHeight,
  setImageQuality,
  setImageOutputFormat,
  setImageOutputCompression,
  setDefaultImageVisibility,
  setReferenceImages,
}: UseImageTurnRecallActionOptions) {
  return useCallback((conversationId: string, turnId: string) => {
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    const turn = conversation?.turns.find((item) => item.id === turnId);
    if (!conversation || !turn) {
      toast.error("未找到对应的对话轮次");
      return;
    }
    const recalled = buildComposerRecallState(turn, defaultImageModel, defaultTextModel);
    cancelPromptApplyRequest();
    setSelectedConversationId(conversationId);
    setComposerMode(recalled.composerMode);
    setImagePrompt(recalled.prompt);
    setImageModel(recalled.model);
    setImageModelOptionId(recalled.channelModelId);
    setImageCount(recalled.count);
    setImageSizeMode(recalled.sizeSelection.mode);
    setImageAspectRatio(recalled.sizeSelection.aspectRatio);
    setImageResolution(recalled.sizeSelection.resolution);
    setImageCustomRatio(recalled.sizeSelection.customRatio);
    setImageCustomWidth(recalled.sizeSelection.customWidth);
    setImageCustomHeight(recalled.sizeSelection.customHeight);
    setImageQuality(recalled.quality);
    setImageOutputFormat(recalled.outputFormat);
    setImageOutputCompression(recalled.outputCompression);
    setDefaultImageVisibility(recalled.visibility);
    setReferenceImages(recalled.referenceImages);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
    toast.success("已将本轮提示词和参数带回创作框");
  }, [cancelPromptApplyRequest, conversationsRef, defaultImageModel, defaultTextModel, setComposerMode, setDefaultImageVisibility, setImageAspectRatio, setImageCount, setImageCustomHeight, setImageCustomRatio, setImageCustomWidth, setImageModel, setImageModelOptionId, setImageOutputCompression, setImageOutputFormat, setImagePrompt, setImageQuality, setImageResolution, setImageSizeMode, setReferenceImages, setSelectedConversationId, textareaRef]);
}
