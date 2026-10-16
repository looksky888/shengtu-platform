import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import {
  PROMPT_AREA_DEFAULT_HEIGHT,
  PROMPT_AREA_KEYBOARD_STEP,
  PROMPT_AREA_MIN_HEIGHT,
  clampPromptAreaHeight,
  getImageFiles,
  getPromptAreaMaxHeight,
  hasDraggedFiles,
  hasDraggedImage,
} from "@/app/image/components/image-composer-utils";

type UseImageComposerInputParams = {
  composerMode: "chat" | "image";
  fileInputRef: RefObject<HTMLInputElement | null>;
  onComposerModeChange: (mode: "chat" | "image") => void;
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
};

export function useImageComposerInput({
  composerMode,
  fileInputRef,
  onComposerModeChange,
  onReferenceImageChange,
}: UseImageComposerInputParams) {
  const [promptAreaHeight, setPromptAreaHeight] = useState(PROMPT_AREA_DEFAULT_HEIGHT);
  const [isPromptAreaResizing, setIsPromptAreaResizing] = useState(false);
  const [isReferenceImageDragActive, setIsReferenceImageDragActive] = useState(false);
  const composerPanelRef = useRef<HTMLDivElement>(null);
  const composerToolbarRef = useRef<HTMLDivElement>(null);
  const promptAreaResizeRef = useRef<{ pointerOffsetY: number } | null>(null);
  const referenceImageDragDepthRef = useRef(0);

  useEffect(() => {
    const handleResize = () => setPromptAreaHeight((height) => clampPromptAreaHeight(height));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isPromptAreaResizing) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isPromptAreaResizing]);

  const addReferenceImages = (files: File[]) => {
    const imageFiles = getImageFiles(files);
    if (imageFiles.length === 0) return;
    if (composerMode === "chat") {
      onComposerModeChange("image");
    }
    void onReferenceImageChange(imageFiles);
  };

  const resetReferenceImageDragState = () => {
    referenceImageDragDepthRef.current = 0;
    setIsReferenceImageDragActive(false);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      addReferenceImages(files);
    }
  };

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (composerMode === "chat") return;
    const imageFiles = getImageFiles(event.clipboardData.files);
    if (imageFiles.length === 0) return;
    event.preventDefault();
    void onReferenceImageChange(imageFiles);
  };

  const handleReferenceImageDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedImage(event.dataTransfer)) return;
    event.preventDefault();
    referenceImageDragDepthRef.current += 1;
    setIsReferenceImageDragActive(true);
    event.dataTransfer.dropEffect = "copy";
  };

  const handleReferenceImageDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedImage(event.dataTransfer)) return;
    event.preventDefault();
    setIsReferenceImageDragActive(true);
    event.dataTransfer.dropEffect = "copy";
  };

  const handleReferenceImageDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedImage(event.dataTransfer)) return;
    event.preventDefault();
    referenceImageDragDepthRef.current = Math.max(0, referenceImageDragDepthRef.current - 1);
    if (referenceImageDragDepthRef.current === 0) {
      setIsReferenceImageDragActive(false);
    }
  };

  const handleReferenceImageDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    resetReferenceImageDragState();
    addReferenceImages(Array.from(event.dataTransfer.files));
  };

  const handlePromptResizeStart = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handleRect = event.currentTarget.getBoundingClientRect();
    promptAreaResizeRef.current = { pointerOffsetY: event.clientY - handleRect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPromptAreaResizing(true);
  };

  const handlePromptResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const resizeState = promptAreaResizeRef.current;
    if (!resizeState) return;
    event.preventDefault();
    const panelRect = composerPanelRef.current?.getBoundingClientRect();
    const toolbarHeight = composerToolbarRef.current?.getBoundingClientRect().height ?? 0;
    if (!panelRect) return;
    const handleHeight = event.currentTarget.getBoundingClientRect().height;
    const nextHeight = panelRect.bottom - toolbarHeight - handleHeight - event.clientY + resizeState.pointerOffsetY;
    setPromptAreaHeight(clampPromptAreaHeight(nextHeight));
  };

  const handlePromptResizeEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (!promptAreaResizeRef.current) return;
    promptAreaResizeRef.current = null;
    setIsPromptAreaResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePromptResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setPromptAreaHeight((height) => clampPromptAreaHeight(height + PROMPT_AREA_KEYBOARD_STEP));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPromptAreaHeight((height) => clampPromptAreaHeight(height - PROMPT_AREA_KEYBOARD_STEP));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setPromptAreaHeight(PROMPT_AREA_MIN_HEIGHT);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setPromptAreaHeight(getPromptAreaMaxHeight());
    }
  };

  const handlePromptResizeLostPointerCapture = () => {
    promptAreaResizeRef.current = null;
    setIsPromptAreaResizing(false);
  };

  const handlePickReferenceImage = () => {
    if (composerMode === "chat") {
      onComposerModeChange("image");
    }
    fileInputRef.current?.click();
  };

  return {
    promptAreaHeight,
    isPromptAreaResizing,
    isReferenceImageDragActive,
    composerPanelRef,
    composerToolbarRef,
    handleFileInputChange,
    handleTextareaPaste,
    handleReferenceImageDragEnter,
    handleReferenceImageDragOver,
    handleReferenceImageDragLeave,
    handleReferenceImageDrop,
    handlePromptResizeStart,
    handlePromptResizeMove,
    handlePromptResizeEnd,
    handlePromptResizeKeyDown,
    handlePromptResizeLostPointerCapture,
    handlePickReferenceImage,
  };
}
