import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { PENDING_STUDIO_PROMPT_STORAGE_KEY } from "@/app/landing/landing-brand";
import { useImageComposerSettings } from "@/app/image/hooks/use-image-composer-settings";
import { useImageComposerWorkflow } from "@/app/image/hooks/use-image-composer-workflow";
import { useImageConversations } from "@/app/image/hooks/use-image-conversations";
import { useImageEditDialogState } from "@/app/image/hooks/use-image-edit-dialog-state";
import { useImageInpaintActions } from "@/app/image/hooks/use-image-inpaint-actions";
import { useImageLightboxState } from "@/app/image/hooks/use-image-lightbox-state";
import { useImagePageLayout } from "@/app/image/hooks/use-image-page-layout";
import { useImagePageModelController } from "@/app/image/hooks/use-image-page-model-controller";
import { useImagePageControllerRefs } from "@/app/image/hooks/use-image-page-controller-refs";
import { useImagePromptPresetAction } from "@/app/image/hooks/use-image-prompt-preset-action";
import { useImageQueueRunner } from "@/app/image/hooks/use-image-queue-runner";
import { useImageTurnActions } from "@/app/image/hooks/use-image-turn-actions";
import { useImageTurnRecallAction } from "@/app/image/hooks/use-image-turn-recall-action";
import { useImageTurnProgressState } from "@/app/image/hooks/use-image-turn-progress-state";
import { useImagePageHistoryController } from "@/app/image/hooks/use-image-page-history-controller";
import { useImageVisibilityActions } from "@/app/image/hooks/use-image-visibility-actions";
import { useReferenceImages } from "@/app/image/hooks/use-reference-images";
import { useSaveEditingTurn } from "@/app/image/hooks/use-save-editing-turn";
import { useSubmitImageTurn } from "@/app/image/hooks/use-submit-image-turn";
import { usePublicModelChannel } from "@/lib/use-public-model-channel";

export function useImagePageController() {
  const { isSubmitDispatchingRef, cancelledTurnIdsRef, resultsViewportRef, composerDockRef, textareaRef,
    promptApplyRequestIdRef, cancelPromptApplyRequest } = useImagePageControllerRefs();
  const { imageModelOptions, chatModelOptions, defaultImageModel, defaultTextModel } = usePublicModelChannel();

  const {
    imagePrompt,
    setImagePrompt,
    composerMode,
    setComposerMode,
    imageModel,
    setImageModel,
    imageModelOptionId,
    setImageModelOptionId,
    imageCount,
    setImageCount,
    imageSizeMode,
    setImageSizeMode,
    imageAspectRatio,
    setImageAspectRatio,
    imageResolution,
    setImageResolution,
    imageCustomRatio,
    setImageCustomRatio,
    imageCustomWidth,
    setImageCustomWidth,
    imageCustomHeight,
    setImageCustomHeight,
    imageQuality,
    setImageQuality,
    imageOutputFormat,
    setImageOutputFormat,
    imageOutputCompression,
    setImageOutputCompression,
    defaultImageVisibility,
    setDefaultImageVisibility,
    parsedCount,
    estimatedCreditCost,
    estimatedCreditCostDetail,
    imageSize,
    currentImageSizeSelection,
    composerModelOptions,
    imageQualityOptions,
    imageOutputHint,
    handleImageCountChange,
    restoreStoredComposerSettings,
  } = useImageComposerSettings({ imageModelOptions, chatModelOptions, defaultImageModel, defaultTextModel });
  const {
    conversations,
    conversationsRef,
    selectedConversationId,
    setSelectedConversationId,
    selectedConversation,
    isLoadingHistory,
    activeTaskCount,
    replaceConversations,
    persistConversation,
    updateConversation,
  } = useImageConversations({ restoreStoredComposerSettings });
  const { progressByTurnKey, progressNow, updateTurnProgress, clearTurnProgress } = useImageTurnProgressState({
    activeTaskCount,
  });
  const { editingTurnDraft, setEditingTurnDraft, openEditTurnDialog } = useImageEditDialogState({
    conversationsRef,
    defaultImageModel,
    defaultTextModel,
  });
  const { lightboxImages, lightboxOpen, setLightboxOpen, lightboxIndex, setLightboxIndex, openLightbox } = useImageLightboxState();
  const {
    fileInputRef,
    editFileInputRef,
    referenceImages,
    setReferenceImages,
    clearReferenceImages,
    handleReferenceImageChange,
    handleRemoveReferenceImage,
    handleContinueEdit,
    handleEditReferenceImageChange,
    handleRemoveEditReferenceImage,
  } = useReferenceImages({
    setSelectedConversationId,
    setComposerMode,
    setImagePrompt,
    textareaRef,
    setEditingTurnDraft,
    cancelPromptApplyRequest,
  });

  const composerDockHeight = useImagePageLayout({
    composerDockRef,
    resultsViewportRef,
    selectedConversationId,
    selectedTurnCount: selectedConversation?.turns.length,
  });

  const { handleComposerModelChange } = useImagePageModelController({
    composerMode,
    imageModel,
    imageModelOptionId,
    defaultImageModel,
    defaultTextModel,
    referenceImageCount: referenceImages.length,
    setImageModel,
    clearReferenceImages,
    composerModelOptions,
    setImageModelOptionId,
  });

  const { clearComposerInputs, resetComposer, handleComposerModeChange } = useImageComposerWorkflow({
    promptApplyRequestIdRef,
    clearReferenceImages,
    setImagePrompt,
    setImageCount,
    setImageOutputFormat,
    setImageOutputCompression,
    setDefaultImageVisibility,
    setComposerMode,
  });
  const {
    isHistoryOpen,
    setIsHistoryOpen,
    deleteConfirm,
    setDeleteConfirm,
    openDeleteConversationConfirm,
    openClearHistoryConfirm,
    openDeleteTurnConfirm,
    handleConfirmDelete,
    handleDeleteTurn,
    handleCreateDraft,
  } = useImagePageHistoryController({
    conversations,
    conversationsRef,
    selectedConversationId,
    setSelectedConversationId,
    replaceConversations,
    resetComposer,
    updateConversation,
    clearTurnProgress,
    textareaRef,
  });

  const handleRecallTurn = useImageTurnRecallAction({
    conversationsRef,
    defaultImageModel,
    defaultTextModel,
    cancelPromptApplyRequest,
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
    textareaRef,
  });

  const handleApplyPromptPreset = useImagePromptPresetAction({
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
  });

  const { visibilityMutatingImageKey, handleImageVisibilityChange } = useImageVisibilityActions({
    conversationsRef,
    updateConversation,
  });

  const { runConversationQueue } = useImageQueueRunner({
    conversations,
    conversationsRef,
    cancelledTurnIdsRef,
    updateConversation,
    updateTurnProgress,
    clearTurnProgress,
  });

  const { handleCancelTurn, handleRetryImage, handleRegenerateTurn } = useImageTurnActions({
    conversationsRef,
    cancelledTurnIdsRef,
    updateConversation,
    runConversationQueue,
    clearTurnProgress,
  });
  const handleSaveEditingTurn = useSaveEditingTurn({
    editingTurnDraft,
    setEditingTurnDraft,
    conversationsRef,
    editFileInputRef,
    updateConversation,
    runConversationQueue,
  });

  const handleSubmit = useSubmitImageTurn({
    isSubmitDispatchingRef,
    imagePrompt,
    composerMode,
    imageModel,
    imageChannelModelId: imageModelOptionId,
    imageModelLabel: imageModelOptions.find((option) => option.id === imageModelOptionId)?.label,
    imageChannelName: imageModelOptions.find((option) => option.id === imageModelOptionId)?.channelName,
    imageChannelType: imageModelOptions.find((option) => option.id === imageModelOptionId)?.channelType,
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
  });

  const {
    inpaintSource: activeInpaintSource,
    setInpaintSource: setActiveInpaintSource,
    handleLocalEdit,
    handleInpaintSubmit,
  } = useImageInpaintActions({
    handleSubmit,
    setSelectedConversationId,
  });

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (isLoadingHistory) return;

    const urlPrompt = (searchParams.get("prompt") || "").trim();
    const isNewDraft = searchParams.get("new") === "1";
    let pendingSessionPrompt = "";
    if (typeof window !== "undefined") {
      try {
        pendingSessionPrompt = (window.sessionStorage.getItem(PENDING_STUDIO_PROMPT_STORAGE_KEY) || "").trim();
      } catch {
        pendingSessionPrompt = "";
      }
    }

    const resolvedPrompt = urlPrompt || pendingSessionPrompt;
    if (!resolvedPrompt && !isNewDraft) return;

    cancelPromptApplyRequest();
    clearReferenceImages();
    setSelectedConversationId(null);
    setComposerMode("image");

    if (resolvedPrompt) {
      setImagePrompt(resolvedPrompt);
    } else {
      resetComposer();
    }

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(PENDING_STUDIO_PROMPT_STORAGE_KEY);
      } catch {
        // Ignore storage restrictions.
      }
    }

    if (searchParams.has("prompt") || searchParams.has("new")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("prompt");
      nextParams.delete("new");
      setSearchParams(nextParams, { replace: true });
    }

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.dataset.presetFlash = "1";
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(resolvedPrompt.length, resolvedPrompt.length);
        } catch {
          // Ignore selection errors.
        }
        window.setTimeout(() => {
          if (textareaRef.current === el) {
            delete el.dataset.presetFlash;
          }
        }, 700);
      });
    }
  }, [
    cancelPromptApplyRequest,
    clearReferenceImages,
    isLoadingHistory,
    resetComposer,
    searchParams,
    setComposerMode,
    setImagePrompt,
    setSearchParams,
    setSelectedConversationId,
    textareaRef,
  ]);

  const handleAppendStyleChip = useCallback(
    (descriptor: string) => {
      const normalized = descriptor.trim();
      if (!normalized) return;
      if (composerMode === "chat") {
        setComposerMode("image");
      }
      setImagePrompt((prev) => {
        const base = prev.trim();
        if (!base) return normalized;
        if (base.includes(normalized)) return prev;
        const separator = /[，,。；;、]$/.test(base) ? "" : "，";
        return `${base}${separator}${normalized}`;
      });
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          textareaRef.current?.focus({ preventScroll: true });
        });
      }
    },
    [composerMode, setComposerMode, setImagePrompt, textareaRef],
  );

  return {
    isSubmitDispatchingRef, cancelledTurnIdsRef, resultsViewportRef, composerDockRef, textareaRef,
    promptApplyRequestIdRef, imageModelOptions, chatModelOptions, defaultImageModel, defaultTextModel,
    imagePrompt, setImagePrompt, composerMode, setComposerMode, imageModel, imageModelOptionId,
    setImageModel, imageCount, setImageCount, imageSizeMode, setImageSizeMode,
    imageAspectRatio, setImageAspectRatio, imageResolution, setImageResolution, imageCustomRatio,
    setImageCustomRatio, imageCustomWidth, setImageCustomWidth, imageCustomHeight, setImageCustomHeight,
    imageQuality, setImageQuality, imageOutputFormat, setImageOutputFormat, imageOutputCompression,
    setImageOutputCompression, defaultImageVisibility, setDefaultImageVisibility, parsedCount, estimatedCreditCost,
    estimatedCreditCostDetail, imageSize, currentImageSizeSelection, composerModelOptions, imageQualityOptions,
    imageOutputHint, handleImageCountChange, restoreStoredComposerSettings, conversations, conversationsRef,
    selectedConversationId, setSelectedConversationId, selectedConversation, isLoadingHistory, activeTaskCount,
    replaceConversations, persistConversation, updateConversation, progressByTurnKey, progressNow,
    updateTurnProgress, clearTurnProgress, editingTurnDraft, setEditingTurnDraft, openEditTurnDialog,
    lightboxImages, lightboxOpen, setLightboxOpen, lightboxIndex, setLightboxIndex,
    openLightbox, fileInputRef, editFileInputRef, referenceImages, setReferenceImages,
    clearReferenceImages, handleReferenceImageChange, handleRemoveReferenceImage, handleContinueEdit, handleEditReferenceImageChange,
    handleRemoveEditReferenceImage, composerDockHeight, clearComposerInputs, resetComposer, handleComposerModeChange,
    isHistoryOpen, setIsHistoryOpen, deleteConfirm, setDeleteConfirm, openDeleteConversationConfirm,
    openClearHistoryConfirm, openDeleteTurnConfirm, handleConfirmDelete, handleCreateDraft, handleApplyPromptPreset, handleAppendStyleChip, visibilityMutatingImageKey,
    handleImageVisibilityChange, runConversationQueue, handleCancelTurn, handleRetryImage, handleRegenerateTurn,
    handleSaveEditingTurn, handleSubmit, handleComposerModelChange, handleRecallTurn, handleDeleteTurn,
    inpaintSource: activeInpaintSource, handleLocalEdit, handleInpaintSubmit, setInpaintSource: setActiveInpaintSource,
  };
}
