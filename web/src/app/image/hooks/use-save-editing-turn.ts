import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";

import { buildImageSize } from "@/app/image/image-options";
import { imageTaskBatchId } from "@/app/image/lib/image-task-utils";
import type { EditingTurnDraft } from "@/app/image/lib/image-page-types";
import {
  getComposerConversationMode,
  imageOutputCompressionForFormat,
  imageQualityForModel,
  isInvalidCustomRatioSelection,
  mapGrokImageSize,
  normalizeRequestedImageCount,
  usesReferenceImages,
} from "@/app/image/lib/image-turn-utils";
import { serializeImageSizeSelection } from "@/app/image/lib/image-storage-utils";
import { buildConversationTitle, createId } from "@/app/image/lib/reference-image-utils";
import { isGrokImageModel } from "@/lib/api";
import { isTurnBusy } from "@/lib/image-turn-state";
import type { ImageConversation } from "@/store/image-conversations";

type UpdateConversation = (
  conversationId: string,
  updater: (current: ImageConversation | null) => ImageConversation,
  options?: { persist?: boolean },
) => Promise<void>;

type UseSaveEditingTurnOptions = {
  editingTurnDraft: EditingTurnDraft | null;
  setEditingTurnDraft: Dispatch<SetStateAction<EditingTurnDraft | null>>;
  conversationsRef: RefObject<ImageConversation[]>;
  editFileInputRef: RefObject<HTMLInputElement | null>;
  updateConversation: UpdateConversation;
  runConversationQueue: (conversationId: string) => void | Promise<void>;
};

export function useSaveEditingTurn({
  editingTurnDraft,
  setEditingTurnDraft,
  conversationsRef,
  editFileInputRef,
  updateConversation,
  runConversationQueue,
}: UseSaveEditingTurnOptions) {
  return useCallback(
    async (regenerate: boolean) => {
      const draft = editingTurnDraft;
      if (!draft) {
        return;
      }
      const prompt = draft.prompt.trim();
      if (!prompt) {
        toast.error("请输入提示词");
        return;
      }

      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === draft.conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === draft.turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      if (isTurnBusy(targetTurn)) {
        toast.error("当前轮次正在处理，稍后再编辑");
        return;
      }

      const imageCount = draft.mode === "chat" ? 1 : normalizeRequestedImageCount(draft.count);
      const mode = draft.mode === "chat" ? "chat" : getComposerConversationMode("image", draft.referenceImages);
      const referenceImages = usesReferenceImages(mode) ? draft.referenceImages : [];
      if (mode !== "chat" && isInvalidCustomRatioSelection(draft.sizeMode, draft.aspectRatio, draft.customRatio)) {
        toast.error("请输入有效的自定义比例，例如 5:4 或 2.39:1");
        return;
      }
      const rawDraftImageSize =
        mode === "chat"
          ? ""
          : buildImageSize({
              mode: draft.sizeMode,
              aspectRatio: draft.aspectRatio,
              resolution: draft.resolution,
              customRatio: draft.customRatio,
              customWidth: draft.customWidth,
              customHeight: draft.customHeight,
            });
      if (mode !== "chat" && draft.sizeMode === "custom" && !rawDraftImageSize) {
        toast.error("请填写有效的宽度和高度");
        return;
      }
      const effectiveSize =
        mode === "chat"
          ? ""
          : isGrokImageModel(draft.model)
            ? mapGrokImageSize(rawDraftImageSize || "1080p")
            : rawDraftImageSize;
      const draftSizeSelection = serializeImageSizeSelection({
        mode: draft.sizeMode,
        aspectRatio: draft.aspectRatio,
        resolution: draft.resolution,
        customRatio: draft.customRatio,
        customWidth: draft.customWidth,
        customHeight: draft.customHeight,
      });
      const draftOutputCompression = imageOutputCompressionForFormat(draft.outputFormat, draft.outputCompression);
      const now = new Date().toISOString();
      const regenerationId = createId();
      await updateConversation(draft.conversationId, (current) => {
        const conversation = current ?? targetConversation;
        const isFirstTurn = conversation.turns[0]?.id === draft.turnId;
        return {
          ...conversation,
          title: isFirstTurn ? buildConversationTitle(prompt) : conversation.title,
          updatedAt: now,
          turns: conversation.turns.map((turn) => {
            if (turn.id !== draft.turnId) {
              return turn;
            }

            const resolvedModelLabel =
              mode === "chat"
                ? undefined
                : draft.modelLabel ||
                  (draft.model === turn.model ? turn.modelLabel : undefined) ||
                  draft.model;

            const baseTurn = {
              ...turn,
              prompt,
              model: draft.model,
              modelLabel: resolvedModelLabel,
              channelModelId: mode === "chat" ? undefined : draft.channelModelId,
              channelName: mode === "chat" ? undefined : draft.channelName,
              mode,
              referenceImages,
              count: imageCount,
              size: effectiveSize,
              sizeSelection: mode === "chat" ? undefined : draftSizeSelection,
              quality: mode === "chat" ? undefined : imageQualityForModel(draft.model, draft.quality),
              outputFormat: mode === "chat" ? undefined : draft.outputFormat,
              outputCompression: mode === "chat" ? undefined : draftOutputCompression,
              visibility: mode === "chat" ? "private" : draft.visibility,
            };
            if (!regenerate) {
              return baseTurn;
            }
            return {
              ...baseTurn,
              status: "queued" as const,
              error: undefined,
              images: Array.from({ length: imageCount }, (_, index) => {
                const imageId = `${turn.id}-${regenerationId}-${index}`;
                return {
                  id: imageId,
                  taskId: imageTaskBatchId(`${turn.id}-${regenerationId}`, index),
                  status: "loading" as const,
                  visibility: baseTurn.mode === "chat" ? undefined : baseTurn.visibility,
                };
              }),
            };
          }),
        };
      });

      setEditingTurnDraft(null);
      if (editFileInputRef.current) {
        editFileInputRef.current.value = "";
      }
      if (regenerate) {
        void runConversationQueue(draft.conversationId);
        toast.success("已保存并加入重新生成队列");
      } else {
        toast.success("已保存编辑设置");
      }
    },
    [conversationsRef, editFileInputRef, editingTurnDraft, runConversationQueue, setEditingTurnDraft, updateConversation],
  );
}
