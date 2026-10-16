import { useEffect, useRef, useState } from "react";

type UseImageComposerMenusParams = {
  composerMode: "chat" | "image";
  supportsQuality: boolean;
};

export function useImageComposerMenus({ composerMode, supportsQuality }: UseImageComposerMenusParams) {
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isAspectRatioMenuOpen, setIsAspectRatioMenuOpen] = useState(false);
  const [isResolutionMenuOpen, setIsResolutionMenuOpen] = useState(false);
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const [isOutputHintOpen, setIsOutputHintOpen] = useState(false);
  const [isImageSettingsOpen, setIsImageSettingsOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const aspectRatioMenuRef = useRef<HTMLDivElement>(null);
  const resolutionMenuRef = useRef<HTMLDivElement>(null);
  const qualityMenuRef = useRef<HTMLDivElement>(null);

  const closeParameterMenus = () => {
    setIsAspectRatioMenuOpen(false);
    setIsResolutionMenuOpen(false);
    setIsQualityMenuOpen(false);
  };

  const handleImageSettingsOpenChange = (open: boolean) => {
    setIsImageSettingsOpen(open);
    if (!open) {
      closeParameterMenus();
      setIsOutputHintOpen(false);
    }
  };

  useEffect(() => {
    if (composerMode === "chat") {
      setIsImageSettingsOpen(false);
      closeParameterMenus();
      setIsOutputHintOpen(false);
    }
  }, [composerMode]);

  useEffect(() => {
    if (!supportsQuality) {
      setIsQualityMenuOpen(false);
      setIsOutputHintOpen(false);
    }
  }, [supportsQuality]);

  useEffect(() => {
    if (!isModelMenuOpen && !isAspectRatioMenuOpen && !isResolutionMenuOpen && !isQualityMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modelMenuRef.current?.contains(target)) {
        setIsModelMenuOpen(false);
      }
      if (!aspectRatioMenuRef.current?.contains(target)) {
        setIsAspectRatioMenuOpen(false);
      }
      if (!resolutionMenuRef.current?.contains(target)) {
        setIsResolutionMenuOpen(false);
      }
      if (!qualityMenuRef.current?.contains(target)) {
        setIsQualityMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isAspectRatioMenuOpen, isModelMenuOpen, isQualityMenuOpen, isResolutionMenuOpen]);

  return {
    isModelMenuOpen,
    isAspectRatioMenuOpen,
    isResolutionMenuOpen,
    isQualityMenuOpen,
    isOutputHintOpen,
    isImageSettingsOpen,
    modelMenuRef,
    aspectRatioMenuRef,
    resolutionMenuRef,
    qualityMenuRef,
    setIsModelMenuOpen,
    setIsAspectRatioMenuOpen,
    setIsResolutionMenuOpen,
    setIsQualityMenuOpen,
    setIsOutputHintOpen,
    closeParameterMenus,
    handleImageSettingsOpenChange,
  };
}
