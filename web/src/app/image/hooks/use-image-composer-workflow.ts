import { useCallback } from "react";

import { DEFAULT_IMAGE_OUTPUT_FORMAT, type ComposerMode } from "@/app/image/lib/image-page-types";
import { getStoredImageCount } from "@/app/image/lib/image-storage-utils";
import type { ImageOutputFormat, ImageVisibility } from "@/lib/api";

type StringSetter = (value: string) => void;

type UseImageComposerWorkflowParams = {
  promptApplyRequestIdRef: { current: number };
  clearReferenceImages: () => void;
  setImagePrompt: StringSetter;
  setImageCount: StringSetter;
  setImageOutputFormat: (value: ImageOutputFormat) => void;
  setImageOutputCompression: StringSetter;
  setDefaultImageVisibility: (value: ImageVisibility) => void;
  setComposerMode: (value: ComposerMode) => void;
};

export function useImageComposerWorkflow({
  promptApplyRequestIdRef,
  clearReferenceImages,
  setImagePrompt,
  setImageCount,
  setImageOutputFormat,
  setImageOutputCompression,
  setDefaultImageVisibility,
  setComposerMode,
}: UseImageComposerWorkflowParams) {
  const clearComposerInputs = useCallback(() => {
    promptApplyRequestIdRef.current += 1;
    setImagePrompt("");
    setImageCount(getStoredImageCount());
    setImageOutputFormat(DEFAULT_IMAGE_OUTPUT_FORMAT);
    setImageOutputCompression("");
    setDefaultImageVisibility("private");
    clearReferenceImages();
  }, [clearReferenceImages, promptApplyRequestIdRef, setDefaultImageVisibility, setImageCount, setImageOutputCompression, setImageOutputFormat, setImagePrompt]);

  const resetComposer = useCallback(() => {
    clearComposerInputs();
  }, [clearComposerInputs]);

  const handleComposerModeChange = useCallback(
    (mode: ComposerMode) => {
      setComposerMode(mode);
      if (mode === "chat") {
        promptApplyRequestIdRef.current += 1;
        setDefaultImageVisibility("private");
        clearReferenceImages();
      }
    },
    [clearReferenceImages, promptApplyRequestIdRef, setComposerMode, setDefaultImageVisibility],
  );

  return { clearComposerInputs, resetComposer, handleComposerModeChange };
}
