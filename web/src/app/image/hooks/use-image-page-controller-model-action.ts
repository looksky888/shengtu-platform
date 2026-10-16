import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { ImageModel } from "@/lib/api";
import type { ImageModelOption } from "@/app/image/hooks/use-image-composer-derived";

type UseImagePageControllerModelActionParams = {
  composerModelOptions: ImageModelOption[];
  setImageModelOptionId: Dispatch<SetStateAction<string>>;
  routeComposerModel: (model: ImageModel) => void;
};

export function useImagePageControllerModelAction({
  composerModelOptions,
  setImageModelOptionId,
  routeComposerModel,
}: UseImagePageControllerModelActionParams) {
  return useCallback((optionId: string) => {
    const option = composerModelOptions.find((item) => item.id === optionId);
    if (!option) return;
    setImageModelOptionId(option.channelModelId || "");
    routeComposerModel(option.value);
  }, [composerModelOptions, routeComposerModel, setImageModelOptionId]);
}
