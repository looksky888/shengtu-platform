import { createContext, useContext } from "react";

import type { ImageComposerProps } from "@/app/image/components/image-composer-types";
import type { useImageComposerInput } from "@/app/image/hooks/use-image-composer-input";
import type { useImageComposerMenus } from "@/app/image/hooks/use-image-composer-menus";

export type ImageComposerContextValue = {
  composerProps: ImageComposerProps;
  menus: ReturnType<typeof useImageComposerMenus>;
  input: ReturnType<typeof useImageComposerInput>;
};

export const ImageComposerContext = createContext<ImageComposerContextValue | null>(null);

export function useImageComposerContext(): ImageComposerContextValue {
  const context = useContext(ImageComposerContext);
  if (!context) {
    throw new Error("useImageComposerContext must be used within ImageComposer");
  }
  return context;
}
