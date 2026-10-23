import { IMAGE_QUALITY_OPTIONS } from "@/app/image/image-options";
import type { EditingTurnDraft } from "@/app/image/lib/image-page-types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  isImageOutputFormat,
  isImageQuality,
  supportsImageQuality,
} from "@/lib/api";
import type { SetEditingTurnDraft } from "@/app/image/components/edit-dialog/types";

type ImageEditOutputFieldsProps = {
  draft: EditingTurnDraft;
  setDraft: SetEditingTurnDraft;
};

export function ImageEditOutputFields({ draft, setDraft }: ImageEditOutputFieldsProps) {
  if (draft.mode === "chat") {
    return null;
  }

  return (
    <>
      <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
        格式
        <Select
          value={draft.outputFormat}
          onValueChange={(value) =>
            setDraft((current) =>
              current && isImageOutputFormat(value)
                ? { ...current, outputFormat: value, outputCompression: value === "png" ? "" : current.outputCompression }
                : current,
            )
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
        压缩率
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          step="1"
          value={draft.outputCompression}
          disabled={draft.outputFormat === "png"}
          onChange={(event) =>
            setDraft((current) => (current ? { ...current, outputCompression: event.target.value } : current))
          }
          placeholder={draft.outputFormat === "png" ? "PNG 不适用" : "0-100"}
        />
      </label>
      {supportsImageQuality(draft.model) ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          质量
          <Select
            value={draft.quality}
            onValueChange={(value) =>
              setDraft((current) => (current && isImageQuality(value) ? { ...current, quality: value } : current))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {IMAGE_QUALITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
      ) : null}
    </>
  );
}
