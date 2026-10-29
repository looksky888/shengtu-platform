"use client";
import { useMemo, type ReactNode } from "react";

import { ComposerPromptPanel } from "@/app/image/components/composer-prompt-panel";
import { ComposerToolbar } from "@/app/image/components/composer-toolbar";
import { ImageComposerContext } from "@/app/image/components/image-composer-context";
import type { ImageComposerProps } from "@/app/image/components/image-composer-types";
import { ImageReferenceStrip } from "@/app/image/components/image-reference-strip";
import { useImageComposerInput } from "@/app/image/hooks/use-image-composer-input";
import { useImageComposerMenus } from "@/app/image/hooks/use-image-composer-menus";

function ImageComposerDock({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}

export function ImageComposer(props: ImageComposerProps) {
  const {
    composerMode,
    imageQualityOptions,
    referenceImages,
    fileInputRef,
    onComposerModeChange,
    onReferenceImageChange,
    onRemoveReferenceImage,
  } = props;

  const menus = useImageComposerMenus({
    composerMode,
    supportsQuality: imageQualityOptions.length > 0,
  });
  const input = useImageComposerInput({
    composerMode,
    fileInputRef,
    onComposerModeChange,
    onReferenceImageChange,
  });

  const contextValue = useMemo(
    () => ({ composerProps: props, menus, input }),
    [props, menus, input],
  );

  return (
    <ImageComposerContext.Provider value={contextValue}>
      <ImageComposerDock>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={input.handleFileInputChange}
        />
        <ImageReferenceStrip
          visible={composerMode === "image"}
          referenceImages={referenceImages}
          onRemoveReferenceImage={onRemoveReferenceImage}
        />
        <ComposerPromptPanel>
          <ComposerToolbar />
        </ComposerPromptPanel>
      </ImageComposerDock>
    </ImageComposerContext.Provider>
  );
}
