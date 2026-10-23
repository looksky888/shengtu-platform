import { IMAGE_OUTPUT_FORMAT_OPTIONS, type ImageOutputFormat } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ComposerOutputSettingsProps = {
  imageOutputFormat: ImageOutputFormat;
  imageOutputFormatLabel: string;
  imageOutputCompression: string;
  compressionDisabled: boolean;
  onImageOutputFormatChange: (value: ImageOutputFormat) => void;
  onImageOutputCompressionChange: (value: string) => void;
};

export function ComposerOutputSettings({
  imageOutputFormat,
  imageOutputFormatLabel,
  imageOutputCompression,
  compressionDisabled,
  onImageOutputFormatChange,
  onImageOutputCompressionChange,
}: ComposerOutputSettingsProps) {
  return (
    <>
      <div className="flex h-8.5 min-w-0 items-center justify-between gap-1.5 rounded-lg bg-surface-muted/75 px-2.5 text-[11px]">
        <span className="shrink-0 font-medium text-muted-foreground">格式</span>
        <Select
          value={imageOutputFormat}
          onValueChange={(value) => {
            const nextFormat = value as ImageOutputFormat;
            onImageOutputFormatChange(nextFormat);
            if (nextFormat === "png") {
              onImageOutputCompressionChange("");
            }
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="图片输出格式"
            className="h-7 min-w-0 flex-1 justify-end gap-1 border-0 bg-transparent px-0 text-right text-xs font-semibold text-foreground shadow-none focus-visible:ring-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label
        className={cn(
          "flex h-8.5 min-w-0 items-center justify-between gap-1.5 rounded-lg bg-surface-muted/75 px-2.5 text-[11px]",
          compressionDisabled && "opacity-55",
        )}
        title={compressionDisabled ? "PNG 不支持压缩率参数" : "JPEG / WebP 压缩率，0-100"}
      >
        <span className="shrink-0 font-medium text-muted-foreground">压缩率</span>
        <Input
          aria-label="图片压缩率"
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          step="1"
          value={imageOutputCompression}
          onChange={(event) => onImageOutputCompressionChange(event.target.value)}
          disabled={compressionDisabled}
          placeholder={compressionDisabled ? "N/A" : "0-100"}
          className="h-7 w-[4.25rem] border-0 bg-transparent px-0 text-right text-xs font-semibold text-foreground shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
        />
      </label>
      <div className="flex h-8.5 min-w-0 items-center justify-between gap-1.5 rounded-lg bg-surface-muted/75 px-2.5 text-[11px]">
        <span className="shrink-0 font-medium text-muted-foreground">输出</span>
        <span className="min-w-0 truncate text-right text-xs font-semibold text-foreground">
          {compressionDisabled || !imageOutputCompression.trim()
            ? imageOutputFormatLabel
            : `${imageOutputFormatLabel} / ${imageOutputCompression.trim()}`}
        </span>
      </div>
    </>
  );
}
