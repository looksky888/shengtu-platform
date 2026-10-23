import { useCallback } from "react";
import { toast } from "sonner";

import {
  getImageSizeSelectionFromSize,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageSizeMode,
} from "@/app/image/image-options";
import { type ImagePromptPreset } from "@/app/image/image-presets";
import { DEFAULT_IMAGE_OUTPUT_FORMAT, type ComposerMode } from "@/app/image/lib/image-page-types";
import { buildReferenceImageFromUrl } from "@/app/image/lib/reference-image-utils";
import type { ImageOutputFormat, ImageVisibility } from "@/lib/api";
import type { StoredReferenceImage } from "@/store/image-conversations";

type StringSetter = (value: string) => void;

type UseImagePromptPresetActionParams = {
  promptApplyRequestIdRef: { current: number };
  textareaRef: { current: HTMLTextAreaElement | null };
  clearReferenceImages: () => void;
  setReferenceImages: (images: StoredReferenceImage[]) => void;
  setSelectedConversationId: (id: string | null) => void;
  setComposerMode: (value: ComposerMode) => void;
  setImagePrompt: StringSetter;
  setImageCount: StringSetter;
  setImageSizeMode: (value: ImageSizeMode) => void;
  setImageAspectRatio: (value: ImageAspectRatio) => void;
  setImageResolution: (value: ImageResolution) => void;
  setImageCustomRatio: StringSetter;
  setImageCustomWidth: StringSetter;
  setImageCustomHeight: StringSetter;
  setImageOutputFormat: (value: ImageOutputFormat) => void;
  setImageOutputCompression: StringSetter;
  setDefaultImageVisibility: (value: ImageVisibility) => void;
};

export function useImagePromptPresetAction({
  promptApplyRequestIdRef,
  textareaRef,
  clearReferenceImages,
  setReferenceImages,
  setSelectedConversationId,
  setComposerMode,
  setImagePrompt,
  setImageCount,
  setImageSizeMode,
  setImageAspectRatio,
  setImageResolution,
  setImageCustomRatio,
  setImageCustomWidth,
  setImageCustomHeight,
  setImageOutputFormat,
  setImageOutputCompression,
  setDefaultImageVisibility,
}: UseImagePromptPresetActionParams) {
  return useCallback(
    async (preset: ImagePromptPreset) => {
      const requestId = promptApplyRequestIdRef.current + 1;
      promptApplyRequestIdRef.current = requestId;
      setSelectedConversationId(null);
      setComposerMode("image");
      setImagePrompt(preset.prompt);
      setImageCount(String(preset.count));
      const presetSizeSelection = getImageSizeSelectionFromSize(preset.size);
      setImageSizeMode("auto");
      setImageAspectRatio("");
      setImageResolution("auto");
      setImageCustomRatio(presetSizeSelection.customRatio);
      setImageCustomWidth(presetSizeSelection.customWidth);
      setImageCustomHeight(presetSizeSelection.customHeight);
      setImageOutputFormat(DEFAULT_IMAGE_OUTPUT_FORMAT);
      setImageOutputCompression("");
      setDefaultImageVisibility("private");
      clearReferenceImages();

      const focusComposerTextarea = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.dataset.presetFlash = "1";
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        const len = preset.prompt.length;
        try {
          el.setSelectionRange(len, len);
          el.scrollTop = 0;
        } catch {
          // Ignore selection errors if textarea is not ready.
        }
        window.setTimeout(() => {
          if (textareaRef.current === el) {
            delete el.dataset.presetFlash;
          }
        }, 700);
      };

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(focusComposerTextarea);
      } else {
        textareaRef.current?.focus();
      }

      const toastId = toast.loading("正在读取参考图");
      try {
        const referenceImage = await buildReferenceImageFromUrl(preset.imageSrc, 0, "preset-reference");
        if (promptApplyRequestIdRef.current !== requestId) {
          toast.dismiss(toastId);
          return;
        }
        setReferenceImages([referenceImage]);
        toast.dismiss(toastId);
        toast.success("已套用提示词和参考图");
      } catch {
        if (promptApplyRequestIdRef.current !== requestId) {
          toast.dismiss(toastId);
          return;
        }
        toast.dismiss(toastId);
        toast.error("已套用提示词，但参考图读取失败");
      }
    },
    [
      clearReferenceImages,
      promptApplyRequestIdRef,
      setComposerMode,
      setDefaultImageVisibility,
      setImageAspectRatio,
      setImageCount,
      setImageCustomHeight,
      setImageCustomRatio,
      setImageCustomWidth,
      setImageOutputCompression,
      setImageOutputFormat,
      setImagePrompt,
      setImageResolution,
      setImageSizeMode,
      setReferenceImages,
      setSelectedConversationId,
      textareaRef,
    ],
  );
}
