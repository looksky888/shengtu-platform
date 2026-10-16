import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";

import type { ImageAspectRatio, ImageSizeMode } from "@/app/image/image-options";
import { requiresPaidAccountImageSize } from "@/app/image/image-paid-size";
import { imageTaskBatchId } from "@/app/image/lib/image-task-utils";
import {
  formatCreationTaskError,
  getComposerConversationMode,
  imageOutputCompressionForFormat,
  imageQualityForModel,
  isInvalidCustomRatioSelection,
  mapGrokImageSize,
  usesReferenceImages,
} from "@/app/image/lib/image-turn-utils";
import { resolveImageModel } from "@/app/image/lib/image-model-selection";
import { buildConversationTitle, createId } from "@/app/image/lib/reference-image-utils";
import type { ImageModel, ImageOutputFormat, ImageQuality, ImageVisibility } from "@/lib/api";
import type { ImageChannelType } from "@/lib/image-channel-api";
import { fetchPublicPoolFreeSlots, isChatModel, isGrokImageModel, isImageCreationModel } from "@/lib/api";
import {
  getImageConversationStats,
  type ImageConversation,
  type ImageTurn,
  type StoredImageSizeSelection,
  type StoredReferenceImage,
} from "@/store/image-conversations";

type UseSubmitImageTurnOptions = {
  isSubmitDispatchingRef: RefObject<boolean>;
  imagePrompt: string;
  composerMode: "chat" | "image";
  imageModel: ImageModel;
  imageChannelModelId: string;
  imageModelLabel?: string;
  imageChannelName?: string;
  imageChannelType?: ImageChannelType;
  defaultTextModel: ImageModel;
  defaultImageModel: ImageModel;
  parsedCount: number;
  imageSizeMode: ImageSizeMode;
  imageAspectRatio: ImageAspectRatio;
  imageCustomRatio: string;
  imageSize: string;
  imageQuality: ImageQuality;
  imageOutputFormat: ImageOutputFormat;
  imageOutputCompression: string;
  defaultImageVisibility: ImageVisibility;
  referenceImages: StoredReferenceImage[];
  currentImageSizeSelection: StoredImageSizeSelection;
  selectedConversationId: string | null;
  conversationsRef: RefObject<ImageConversation[]>;
  setSelectedConversationId: Dispatch<SetStateAction<string | null>>;
  clearComposerInputs: () => void;
  persistConversation: (conversation: ImageConversation) => Promise<void>;
  runConversationQueue: (conversationId: string) => void | Promise<void>;
  updateTurnProgress: (
    conversationId: string,
    turnId: string,
    updates: { message: string; detail?: string; startedAt?: number },
  ) => void;
  clearTurnProgress: (conversationId: string, turnId: string) => void;
};

export type SubmitImageTurnOverrides = {
  prompt?: string;
  composerMode?: "chat" | "image";
  referenceImages?: StoredReferenceImage[];
};

export function useSubmitImageTurn({
  isSubmitDispatchingRef,
  imagePrompt,
  composerMode,
  imageModel,
  imageChannelModelId,
  imageModelLabel,
  imageChannelName,
  imageChannelType,
  defaultTextModel,
  defaultImageModel,
  parsedCount,
  imageSizeMode,
  imageAspectRatio,
  imageCustomRatio,
  imageSize,
  imageQuality,
  imageOutputFormat,
  imageOutputCompression,
  defaultImageVisibility,
  referenceImages,
  currentImageSizeSelection,
  selectedConversationId,
  conversationsRef,
  setSelectedConversationId,
  clearComposerInputs,
  persistConversation,
  runConversationQueue,
  updateTurnProgress,
  clearTurnProgress,
}: UseSubmitImageTurnOptions) {
  return useCallback(async (overrides: SubmitImageTurnOverrides = {}) => {
    if (isSubmitDispatchingRef.current) {
      return;
    }

    const prompt = (overrides.prompt ?? imagePrompt).trim();
    const effectiveComposerMode = overrides.composerMode ?? composerMode;
    const effectiveReferenceImages = overrides.referenceImages ?? referenceImages;
    if (!prompt) {
      toast.error("请输入提示词");
      return;
    }
    if (effectiveComposerMode === "image" && imageSizeMode === "custom" && !imageSize) {
      toast.error("请填写有效的宽度和高度");
      return;
    }
    if (effectiveComposerMode === "image" && isInvalidCustomRatioSelection(imageSizeMode, imageAspectRatio, imageCustomRatio)) {
      toast.error("请输入有效的自定义比例，例如 5:4 或 2.39:1");
      return;
    }
    if (effectiveComposerMode === "image" && imageChannelType === "account_pool" && requiresPaidAccountImageSize(imageSize)) {
      toast.error("本地号池已禁用需要 Paid 账号的大尺寸，请选择标准尺寸");
      return;
    }

    isSubmitDispatchingRef.current = true;
    let draftProgressTarget: { conversationId: string; turnId: string } | null = null;

    try {
      const effectiveImageMode = getComposerConversationMode(effectiveComposerMode, effectiveReferenceImages);
      const effectiveModel = resolveImageModel({
        mode: effectiveImageMode === "chat" ? "chat" : "image",
        requestedModel: imageModel,
        channelModelId: effectiveImageMode === "chat" ? undefined : imageChannelModelId,
        defaultModel: effectiveImageMode === "chat" ? defaultTextModel : defaultImageModel,
        isKnownModel: effectiveImageMode === "chat" ? isChatModel : isImageCreationModel,
      }) as ImageModel;
      const requestedCount = effectiveImageMode === "chat" ? 1 : parsedCount;

      // /health.account_pool only describes the ChatGPT account pool. Grok has
      // its own provider queue and must never be blocked or warned by this snapshot.
      if (effectiveImageMode !== "chat" && !isGrokImageModel(effectiveModel) && requestedCount > 1) {
        const freeSlots = await fetchPublicPoolFreeSlots();
        if (freeSlots !== null && requestedCount > freeSlots) {
          toast.info(
            freeSlots <= 0
              ? `当前 GPT 号池暂无即时空闲槽，${requestedCount} 张图片会进入队列等待。`
              : `当前 GPT 号池约有 ${freeSlots} 个即时空闲槽，超出的图片会进入队列等待。`,
            { description: "任务会正常提交，排队不代表生成失败。" },
          );
        }
      }
      const effectiveOutputCompression = imageOutputCompressionForFormat(imageOutputFormat, imageOutputCompression);
      const targetConversation = selectedConversationId
        ? conversationsRef.current.find((conversation) => conversation.id === selectedConversationId) ?? null
        : null;
      const now = new Date().toISOString();
      const conversationId = targetConversation?.id ?? createId();
      const turnId = createId();
      const draftTurn: ImageTurn = {
        id: turnId,
        prompt,
        model: effectiveModel,
        modelLabel: effectiveImageMode === "chat" ? undefined : imageModelLabel || effectiveModel,
        channelModelId: effectiveImageMode === "chat" ? undefined : imageChannelModelId || undefined,
        channelName: effectiveImageMode === "chat" ? undefined : imageChannelName,
        mode: effectiveImageMode,
        referenceImages: usesReferenceImages(effectiveImageMode) ? effectiveReferenceImages : [],
        count: requestedCount,
        size:
          effectiveImageMode === "chat"
            ? ""
            : isGrokImageModel(effectiveModel)
              ? mapGrokImageSize(imageSize || "1080p")
              : imageSize,
        sizeSelection: effectiveImageMode === "chat" ? undefined : currentImageSizeSelection,
        quality: effectiveImageMode === "chat" ? undefined : imageQualityForModel(effectiveModel, imageQuality),
        outputFormat: effectiveImageMode === "chat" ? undefined : imageOutputFormat,
        outputCompression: effectiveImageMode === "chat" ? undefined : effectiveOutputCompression,
        visibility: effectiveImageMode === "chat" ? "private" : defaultImageVisibility,
        images: Array.from({ length: requestedCount }, (_, index) => ({
          id: `${turnId}-${index}`,
          taskId: imageTaskBatchId(turnId, index),
          status: "loading" as const,
          visibility: effectiveImageMode === "chat" ? undefined : defaultImageVisibility,
        })),
        createdAt: now,
        status: "queued",
      };
      const baseConversation: ImageConversation = targetConversation
        ? {
            ...targetConversation,
            title: targetConversation.turns.length === 0 ? buildConversationTitle(prompt) : targetConversation.title,
            updatedAt: now,
            turns: [...targetConversation.turns, draftTurn],
          }
        : {
            id: conversationId,
            title: buildConversationTitle(prompt),
            createdAt: now,
            updatedAt: now,
            turns: [draftTurn],
          };

      draftProgressTarget = { conversationId, turnId };
      updateTurnProgress(conversationId, turnId, {
        message: "正在创建草稿记录",
        detail: effectiveImageMode === "chat" ? "正在保存对话请求" : "正在保存提示词和生成参数",
      });
      setSelectedConversationId(conversationId);
      clearComposerInputs();

      await persistConversation(baseConversation);
      void runConversationQueue(conversationId);

      const targetStats = getImageConversationStats(baseConversation);
      if (targetStats.running > 0 || targetStats.queued > 1) {
        toast.success("已加入当前对话队列");
      } else if (!targetConversation) {
        toast.success(effectiveImageMode === "chat" ? "已创建新对话并发送" : "已创建新对话并开始生成");
      } else {
        toast.success("已发送到当前对话");
      }
    } catch (error) {
      if (draftProgressTarget) {
        clearTurnProgress(draftProgressTarget.conversationId, draftProgressTarget.turnId);
      }
      toast.error(formatCreationTaskError(error, "提交任务失败"));
    } finally {
      isSubmitDispatchingRef.current = false;
    }
  }, [
    clearComposerInputs,
    clearTurnProgress,
    composerMode,
    conversationsRef,
    currentImageSizeSelection,
    defaultImageModel,
    defaultImageVisibility,
    defaultTextModel,
    imageAspectRatio,
    imageCustomRatio,
    imageModel,
    imageChannelModelId,
    imageModelLabel,
    imageChannelName,
    imageChannelType,
    imageOutputCompression,
    imageOutputFormat,
    imagePrompt,
    imageQuality,
    imageSize,
    imageSizeMode,
    isSubmitDispatchingRef,
    parsedCount,
    persistConversation,
    referenceImages,
    runConversationQueue,
    selectedConversationId,
    setSelectedConversationId,
    updateTurnProgress,
  ]);
}
