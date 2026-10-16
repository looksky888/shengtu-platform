import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";

import type { ComposerMode } from "@/app/image/lib/image-page-types";
import { resolveImageModel } from "@/app/image/lib/image-model-selection";
import { isChatModel, isImageCreationModel, isVideoCreationModel, type ImageModel } from "@/lib/api";

type UseImageModelRoutingOptions = {
  composerMode: ComposerMode;
  imageModel: ImageModel;
  imageModelOptionId: string;
  defaultImageModel: ImageModel;
  defaultTextModel: ImageModel;
  referenceImageCount: number;
  setImageModel: Dispatch<SetStateAction<ImageModel>>;
  clearReferenceImages: () => void;
};

export function useImageModelRouting({
  composerMode,
  imageModel,
  imageModelOptionId,
  defaultImageModel,
  defaultTextModel,
  referenceImageCount,
  setImageModel,
  clearReferenceImages,
}: UseImageModelRoutingOptions) {
  const navigate = useNavigate();

  useEffect(() => {
    if (composerMode === "chat") {
      if (!isChatModel(imageModel)) {
        setImageModel(defaultTextModel);
      }
      if (referenceImageCount > 0) {
        clearReferenceImages();
      }
      return;
    }

    const resolved = resolveImageModel({
      mode: composerMode,
      requestedModel: imageModel,
      channelModelId: imageModelOptionId,
      defaultModel: defaultImageModel,
      isKnownModel: isImageCreationModel,
    });
    if (resolved !== imageModel) {
      setImageModel(resolved);
    }
  }, [clearReferenceImages, composerMode, defaultImageModel, defaultTextModel, imageModel, imageModelOptionId, referenceImageCount, setImageModel]);

  return useCallback((model: ImageModel) => {
    if (isVideoCreationModel(model)) {
      navigate("/video");
      return;
    }
    setImageModel(model);
  }, [navigate, setImageModel]);
}
