import { useMemo } from "react";

import {
  IMAGE_SIZE_MODE_OPTIONS,
  buildImageSize,
  formatImageSizeDisplay,
  isImageSizeMode,
} from "@/app/image/image-options";
import type { EditingTurnDraft } from "@/app/image/lib/image-page-types";
import { RatioSizeFields } from "@/app/image/components/edit-dialog/image-edit-ratio-fields";
import { isInvalidCustomRatioSelection } from "@/app/image/lib/image-turn-utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SetEditingTurnDraft } from "@/app/image/components/edit-dialog/types";

type ImageEditSizeFieldsProps = {
  draft: EditingTurnDraft;
  setDraft: SetEditingTurnDraft;
};

export function ImageEditSizeFields({ draft, setDraft }: ImageEditSizeFieldsProps) {
  const imageSize = useMemo(() => {
    if (draft.mode === "chat") return "";
    return buildImageSize({
      mode: draft.sizeMode,
      aspectRatio: draft.aspectRatio,
      resolution: draft.resolution,
      customRatio: draft.customRatio,
      customWidth: draft.customWidth,
      customHeight: draft.customHeight,
    });
  }, [draft]);
  const customRatioInvalid = isInvalidCustomRatioSelection(draft.sizeMode, draft.aspectRatio, draft.customRatio);
  const previewLabel = imageSize
    ? formatImageSizeDisplay(imageSize)
    : draft.sizeMode === "auto" || (draft.sizeMode === "ratio" && draft.resolution === "auto" && !customRatioInvalid)
      ? "Auto"
      : "尺寸无效";
  const previewDetail =
    draft.sizeMode === "ratio"
      ? customRatioInvalid
        ? "比例需要填写为宽:高"
        : draft.resolution === "auto"
          ? imageSize
            ? `将按 ${imageSize} 比例下发`
            : "Auto 比例将交给模型决定"
          : imageSize
            ? `将下发计算后的 ${formatImageSizeDisplay(imageSize)}`
            : "比例需要填写为宽:高"
      : draft.sizeMode === "custom"
        ? imageSize
          ? `已按链路限制校准为 ${formatImageSizeDisplay(imageSize)}`
          : "宽高需要填写正整数"
        : "不会强制指定尺寸";

  if (draft.mode === "chat") {
    return null;
  }

  return (
    <>
      <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
        尺寸
        <Select
          value={draft.sizeMode}
          onValueChange={(value) =>
            setDraft((current) =>
              current && isImageSizeMode(value)
                ? {
                    ...current,
                    sizeMode: value,
                    aspectRatio: value === "ratio" ? "" : current.aspectRatio,
                    resolution: value === "ratio" ? "auto" : current.resolution,
                  }
                : current,
            )
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {IMAGE_SIZE_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      {draft.sizeMode === "custom" ? (
        <CustomSizeFields draft={draft} setDraft={setDraft} />
      ) : null}
      {draft.sizeMode === "ratio" ? (
        <RatioSizeFields draft={draft} setDraft={setDraft} customRatioInvalid={customRatioInvalid} />
      ) : null}
      {draft.sizeMode !== "auto" ? (
        <div className="rounded-xl border border-border/75 bg-surface-muted/60 px-3 py-2 text-sm sm:col-span-2 lg:col-span-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="shrink-0 font-medium text-muted-foreground">计算后分辨率</span>
            <span className="min-w-0 truncate text-right font-mono font-semibold text-foreground">
              {previewLabel}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{previewDetail}</div>
        </div>
      ) : null}
    </>
  );
}

function CustomSizeFields({ draft, setDraft }: ImageEditSizeFieldsProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 lg:col-span-2">
      <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-foreground">
        宽度
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={draft.customWidth}
          onChange={(event) => setDraft((current) => (current ? { ...current, customWidth: event.target.value } : current))}
        />
      </label>
      <span className="pb-2 text-sm font-medium text-muted-foreground">x</span>
      <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-foreground">
        高度
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={draft.customHeight}
          onChange={(event) => setDraft((current) => (current ? { ...current, customHeight: event.target.value } : current))}
        />
      </label>
    </div>
  );
}
