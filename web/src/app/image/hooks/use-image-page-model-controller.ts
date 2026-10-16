import type { ComposerMode } from "@/app/image/lib/image-page-types";
import type { ImageModelOption } from "@/app/image/hooks/use-image-composer-derived";
import { useImageModelRouting } from "@/app/image/hooks/use-image-model-routing";
import { useImagePageControllerModelAction } from "@/app/image/hooks/use-image-page-controller-model-action";
import type { ImageModel } from "@/lib/api";

type UseImagePageModelControllerParams = {
  composerMode: ComposerMode;
  imageModel: ImageModel;
  imageModelOptionId: string;
  defaultImageModel: ImageModel;
  defaultTextModel: ImageModel;
  referenceImageCount: number;
  setImageModel: Dispatch<SetStateAction<ImageModel>>;
  clearReferenceImages: () => void;
  composerModelOptions: ImageModelOption[];
  setImageModelOptionId: Dispatch<SetStateAction<string>>;
};

export function useImagePageModelController({
  composerMode,
  imageModel,
  imageModelOptionId,
  defaultImageModel,
  defaultTextModel,
  referenceImageCount,
  setImageModel,
  clearReferenceImages,
  composerModelOptions,
  setImageModelOptionId,
}: UseImagePageModelControllerParams) {
  const routeComposerModel = useImageModelRouting({
    composerMode,
    imageModel,
    imageModelOptionId,
    defaultImageModel,
    defaultTextModel,
    referenceImageCount,
    setImageModel,
    clearReferenceImages,
  });

  const handleComposerModelChange = useImagePageControllerModelAction({
    composerModelOptions,
    setImageModelOptionId,
    routeComposerModel,
  });

  return { handleComposerModelChange };
}
import type { Dispatch, SetStateAction } from "react";
