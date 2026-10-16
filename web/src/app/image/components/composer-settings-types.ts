import type { ReactNode, RefObject } from "react";

import type { ImageAspectRatio, ImageResolution, ImageSizeMode } from "@/app/image/image-options";
import type { ImageOutputFormat, ImageQuality } from "@/lib/api";
import type { ImageChannelType } from "@/lib/image-channel-api";

export type ImageQualityOption = {
  value: ImageQuality;
  label: string;
  description: string;
};

export type ComposerSettingsPopoverProps = {
  isOpen: boolean;
  isAspectRatioMenuOpen: boolean;
  isResolutionMenuOpen: boolean;
  isQualityMenuOpen: boolean;
  isOutputHintOpen: boolean;
  aspectRatioMenuRef: RefObject<HTMLDivElement | null>;
  resolutionMenuRef: RefObject<HTMLDivElement | null>;
  qualityMenuRef: RefObject<HTMLDivElement | null>;
  /** Used to switch Grok-friendly size whitelist in the ratio/resolution menus. */
  imageModel?: string;
  imageChannelType?: ImageChannelType;
  imageResolutions?: string[];
  imageCount: string;
  imageSizeMode: ImageSizeMode;
  imageAspectRatio: ImageAspectRatio;
  imageResolution: ImageResolution;
  imageCustomRatio: string;
  imageCustomWidth: string;
  imageCustomHeight: string;
  imageQuality: ImageQuality;
  imageQualityOptions: ReadonlyArray<ImageQualityOption>;
  imageOutputFormat: ImageOutputFormat;
  imageOutputCompression: string;
  imageOutputHint: ReactNode;
  estimatedCreditCost: number;
  estimatedCreditCostDetail: string;
  onOpenChange: (open: boolean) => void;
  onAspectRatioMenuOpenChange: (open: boolean) => void;
  onResolutionMenuOpenChange: (open: boolean) => void;
  onQualityMenuOpenChange: (open: boolean) => void;
  onOutputHintOpenChange: (open: boolean) => void;
  onCloseModelMenu: () => void;
  onImageCountChange: (value: string) => void;
  onImageSizeModeChange: (value: ImageSizeMode) => void;
  onImageAspectRatioChange: (value: ImageAspectRatio) => void;
  onImageResolutionChange: (value: ImageResolution) => void;
  onImageCustomRatioChange: (value: string) => void;
  onImageCustomWidthChange: (value: string) => void;
  onImageCustomHeightChange: (value: string) => void;
  onImageQualityChange: (value: ImageQuality) => void;
  onImageOutputFormatChange: (value: ImageOutputFormat) => void;
  onImageOutputCompressionChange: (value: string) => void;
};
