import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { readFileAsDataUrl } from "@/app/image/lib/reference-image-utils";
import { PENDING_STUDIO_PROMPT_STORAGE_KEY } from "@/app/landing/landing-brand";
import { fetchAuthorizedImageBlob } from "@/lib/media-fetch";
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

type RemixLocationState = {
  remixImageUrl?: string;
  remixImageName?: string;
  remixPrompt?: string;
} | null;

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
    handleDeleteConversation,
    handleClearHistory,
    openDeleteConversationConfirm,
    openClearHistoryConfirm,
    openDeleteTurnConfirm,
    handleConfirmDelete,
    handleDeleteTurn,
    handleCreateDraft,
    handleRenameConversation,
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

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledRemixKeyRef = useRef<string | null>(null);

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

  // Handle remix navigation from /assets ("去二创" passing location.state.remixImageUrl or ?ref_url=)
  useEffect(() => {
    if (isLoadingHistory) return;

    const routeState = (location.state as RemixLocationState) ?? null;
    const stateRemixUrl = (routeState?.remixImageUrl || "").trim();
    const queryRemixUrl = (searchParams.get("ref_url") || "").trim();
    const remixUrl = stateRemixUrl || queryRemixUrl;
    if (!remixUrl) return;

    const dedupeKey = `${location.key}:${remixUrl}`;
    if (handledRemixKeyRef.current === dedupeKey) return;
    handledRemixKeyRef.current = dedupeKey;

    const remixName = (routeState?.remixImageName || "").trim();
    const remixPrompt = (routeState?.remixPrompt || "").trim();
    const abortController = new AbortController();
    let settled = false;

    const clearRemixRouteParams = () => {
      if (typeof window === "undefined") return;
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("ref_url");
      const nextSearch = nextParams.toString();
      navigate(`${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
        replace: true,
        state: null,
      });
    };

    cancelPromptApplyRequest();
    clearReferenceImages();
    setActiveInpaintSource(null);
    setSelectedConversationId(null);
    setComposerMode("image");
    if (remixPrompt) {
      setImagePrompt((prev) => (prev.trim() ? prev : remixPrompt));
    }

    void (async () => {
      try {
        const response = await fetchAuthorizedImageBlob(
          remixUrl,
          abortController.signal,
        );
        if (!response.ok) {
          throw new Error("载入参考图失败，素材可能已过期或不可访问");
        }
        const blob = await response.blob();
        if (abortController.signal.aborted) return;

        const fallbackName =
          remixName ||
          remixUrl.split(/[?#]/, 1)[0]?.split("/").filter(Boolean).pop() ||
          "remix-reference.png";
        const normalizedName = fallbackName.includes(".")
          ? fallbackName
          : `${fallbackName}.png`;
        const file = new File([blob], normalizedName, {
          type: blob.type || "image/png",
        });
        const dataUrl = await readFileAsDataUrl(file);
        if (abortController.signal.aborted) return;

        settled = true;
        setActiveInpaintSource(null);
        setComposerMode("image");
        setReferenceImages([
          {
            name: file.name,
            type: file.type || "image/png",
            dataUrl,
            source: "upload",
          },
        ]);
        toast.success("已载入参考图，可直接输入修改指令创作");
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            textareaRef.current?.focus({ preventScroll: true });
          });
        }
      } catch (error) {
        if (
          abortController.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        settled = true;
        toast.error(
          error instanceof Error ? error.message : "载入参考图失败，请稍后重试",
        );
      } finally {
        if (!abortController.signal.aborted) {
          clearRemixRouteParams();
        }
      }
    })();

    return () => {
      if (!settled) {
        abortController.abort();
        if (handledRemixKeyRef.current === dedupeKey) {
          handledRemixKeyRef.current = null;
        }
      }
    };
  }, [
    cancelPromptApplyRequest,
    clearReferenceImages,
    isLoadingHistory,
    location.key,
    location.pathname,
    location.state,
    navigate,
    searchParams,
    setActiveInpaintSource,
    setComposerMode,
    setImagePrompt,
    setReferenceImages,
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
    isHistoryOpen, setIsHistoryOpen, deleteConfirm, setDeleteConfirm, handleDeleteConversation, handleClearHistory, openDeleteConversationConfirm,
    openClearHistoryConfirm, openDeleteTurnConfirm, handleConfirmDelete, handleCreateDraft, handleRenameConversation, handleApplyPromptPreset, handleAppendStyleChip, visibilityMutatingImageKey,
    handleImageVisibilityChange, runConversationQueue, handleCancelTurn, handleRetryImage, handleRegenerateTurn,
    handleSaveEditingTurn, handleSubmit, handleComposerModelChange, handleRecallTurn, handleDeleteTurn,
    inpaintSource: activeInpaintSource, handleLocalEdit, handleInpaintSubmit, setInpaintSource: setActiveInpaintSource,
  };
}
