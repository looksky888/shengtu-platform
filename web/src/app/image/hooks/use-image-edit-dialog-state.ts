import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  DEFAULT_IMAGE_CUSTOM_HEIGHT,
  DEFAULT_IMAGE_CUSTOM_RATIO,
  DEFAULT_IMAGE_CUSTOM_WIDTH,
} from "@/app/image/image-options";
import {
  DEFAULT_IMAGE_OUTPUT_FORMAT,
  DEFAULT_IMAGE_QUALITY,
  type EditingTurnDraft,
} from "@/app/image/lib/image-page-types";
import { restoreImageSizeSelection } from "@/app/image/lib/image-storage-utils";
import { normalizeRequestedImageCount } from "@/app/image/lib/image-turn-utils";
import { isChatModel, isImageCreationModel, type ImageModel } from "@/lib/api";
import { isTurnBusy } from "@/lib/image-turn-state";
import type { ImageConversation } from "@/store/image-conversations";

type UseImageEditDialogStateParams = {
  conversationsRef: { current: ImageConversation[] };
  defaultImageModel: ImageModel;
  defaultTextModel: ImageModel;
};

export function useImageEditDialogState({
  conversationsRef,
  defaultImageModel,
  defaultTextModel,
}: UseImageEditDialogStateParams) {
  const [editingTurnDraft, setEditingTurnDraft] = useState<EditingTurnDraft | null>(null);

  const openEditTurnDialog = useCallback(
    (conversationId: string, turnId: string) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      if (isTurnBusy(targetTurn)) {
        toast.error("当前轮次正在处理，稍后再编辑");
        return;
      }
      const sizeSelection = restoreImageSizeSelection(targetTurn.sizeSelection, targetTurn.size);
      setEditingTurnDraft({
        conversationId,
        turnId,
        prompt: targetTurn.prompt,
        model:
          targetTurn.mode === "chat"
            ? isChatModel(targetTurn.model)
              ? targetTurn.model
              : defaultTextModel
            : isImageCreationModel(targetTurn.model)
              ? targetTurn.model
              : defaultImageModel,
        channelModelId: targetTurn.mode === "chat" ? undefined : targetTurn.channelModelId,
        channelName: targetTurn.mode === "chat" ? undefined : targetTurn.channelName,
        mode: targetTurn.mode,
        count: targetTurn.mode === "chat" ? "1" : String(normalizeRequestedImageCount(targetTurn.count || targetTurn.images.length || 1)),
        sizeMode: targetTurn.mode === "chat" ? "auto" : sizeSelection.mode,
        aspectRatio: targetTurn.mode === "chat" ? "" : sizeSelection.aspectRatio,
        resolution: targetTurn.mode === "chat" ? "auto" : sizeSelection.mode === "ratio" ? "auto" : sizeSelection.resolution,
        customRatio: targetTurn.mode === "chat" ? DEFAULT_IMAGE_CUSTOM_RATIO : sizeSelection.customRatio,
        customWidth: targetTurn.mode === "chat" ? DEFAULT_IMAGE_CUSTOM_WIDTH : sizeSelection.customWidth,
        customHeight: targetTurn.mode === "chat" ? DEFAULT_IMAGE_CUSTOM_HEIGHT : sizeSelection.customHeight,
        quality: targetTurn.quality || DEFAULT_IMAGE_QUALITY,
        outputFormat: targetTurn.outputFormat || DEFAULT_IMAGE_OUTPUT_FORMAT,
        outputCompression:
          targetTurn.outputCompression === undefined || targetTurn.outputCompression === null ? "" : String(targetTurn.outputCompression),
        visibility: targetTurn.visibility || "private",
        referenceImages: targetTurn.mode === "chat" ? [] : targetTurn.referenceImages,
      });
    },
    [conversationsRef, defaultImageModel, defaultTextModel],
  );

  return { editingTurnDraft, setEditingTurnDraft, openEditTurnDialog };
}
