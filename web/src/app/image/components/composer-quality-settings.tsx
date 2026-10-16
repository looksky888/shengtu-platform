import type { ReactNode, RefObject } from "react";
import { CircleHelp } from "lucide-react";

import { ComposerOptionMenu } from "@/app/image/components/composer-option-menu";
import type { ImageQualityOption } from "@/app/image/components/composer-settings-types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ImageQuality } from "@/lib/api";

type ComposerQualitySettingsProps = {
  supportsQuality: boolean;
  qualityMenuRef: RefObject<HTMLDivElement | null>;
  isQualityMenuOpen: boolean;
  isOutputHintOpen: boolean;
  imageQuality: ImageQuality;
  imageQualityLabel: string;
  imageQualityOptions: ReadonlyArray<ImageQualityOption>;
  imageOutputHint: ReactNode;
  onCloseModelMenu: () => void;
  onQualityMenuOpenChange: (open: boolean) => void;
  onOutputHintOpenChange: (open: boolean) => void;
  onAspectRatioMenuOpenChange: (open: boolean) => void;
  onResolutionMenuOpenChange: (open: boolean) => void;
  onImageQualityChange: (value: ImageQuality) => void;
};

export function ComposerQualitySettings({
  supportsQuality,
  qualityMenuRef,
  isQualityMenuOpen,
  isOutputHintOpen,
  imageQuality,
  imageQualityLabel,
  imageQualityOptions,
  imageOutputHint,
  onCloseModelMenu,
  onQualityMenuOpenChange,
  onOutputHintOpenChange,
  onAspectRatioMenuOpenChange,
  onResolutionMenuOpenChange,
  onImageQualityChange,
}: ComposerQualitySettingsProps) {
  if (!supportsQuality) {
    return null;
  }
  return (
    <ComposerOptionMenu
      menuRef={qualityMenuRef}
      open={isQualityMenuOpen}
      label={(
        <>
          质量
          <Popover open={isOutputHintOpen} onOpenChange={onOutputHintOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-4 shrink-0 items-center justify-center text-[#8e8e93] transition hover:text-[#45515e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-muted-foreground dark:hover:text-foreground"
                aria-label="查看图片输出说明"
              >
                <CircleHelp className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              side="top"
              sideOffset={6}
              className="z-[120] w-[min(calc(100vw-2rem),20rem)] rounded-xl border-[#e5e7eb] bg-white px-4 py-3 text-xs leading-6 text-[#45515e] shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] dark:border-border dark:bg-card dark:text-muted-foreground dark:shadow-[0_24px_80px_-28px_rgba(0,0,0,0.72)]"
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              {imageOutputHint}
            </PopoverContent>
          </Popover>
        </>
      )}
      buttonAriaLabel="选择图片质量"
      value={imageQuality}
      valueLabel={imageQualityLabel}
      options={imageQualityOptions}
      getOptionTitle={(option) => option.description}
      onToggle={() => {
        onQualityMenuOpenChange(!isQualityMenuOpen);
        onCloseModelMenu();
        onAspectRatioMenuOpenChange(false);
        onResolutionMenuOpenChange(false);
      }}
      onSelect={(value) => {
        onImageQualityChange(value);
        onQualityMenuOpenChange(false);
      }}
    />
  );
}
