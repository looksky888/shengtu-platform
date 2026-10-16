import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_RATIO_RESOLUTION_OPTIONS,
  isImageAspectRatio,
  isImageResolution,
} from "@/app/image/image-options";
import {
  EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE,
  GRAYSCALE_TEST_UNAVAILABLE_LABEL,
  type EditingTurnDraft,
} from "@/app/image/lib/image-page-types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SetEditingTurnDraft } from "@/app/image/components/edit-dialog/types";

type RatioSizeFieldsProps = {
  draft: EditingTurnDraft;
  setDraft: SetEditingTurnDraft;
  customRatioInvalid: boolean;
};

export function RatioSizeFields({ draft, setDraft, customRatioInvalid }: RatioSizeFieldsProps) {
  return (
    <>
      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
        比例
        <Select
          value={draft.aspectRatio || EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE}
          onValueChange={(value) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    aspectRatio:
                      value === EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE
                        ? ""
                        : isImageAspectRatio(value)
                          ? value
                          : current.aspectRatio,
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
              {IMAGE_ASPECT_RATIO_OPTIONS.map((option) => (
                <SelectItem
                  key={option.label}
                  value={option.value || EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE}
                  disabled={option.value !== ""}
                >
                  {option.value === "" ? option.label : `${option.label}（${GRAYSCALE_TEST_UNAVAILABLE_LABEL}）`}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
        分辨率
        <Select
          value={draft.resolution}
          onValueChange={(value) =>
            setDraft((current) => (current && isImageResolution(value) ? { ...current, resolution: value } : current))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {IMAGE_RATIO_RESOLUTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.value !== "auto"}>
                  {option.value === "auto" ? option.label : `${option.label}（${GRAYSCALE_TEST_UNAVAILABLE_LABEL}）`}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      {draft.aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
          自定义比例
          <Input
            value={draft.customRatio}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, customRatio: event.target.value } : current))
            }
            placeholder="例如 5:4 / 2.39:1"
            aria-invalid={customRatioInvalid}
            className={cn(customRatioInvalid && "border-red-300 focus-visible:ring-red-500/20")}
          />
        </label>
      ) : null}
    </>
  );
}
