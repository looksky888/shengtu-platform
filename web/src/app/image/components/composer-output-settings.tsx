import { IMAGE_OUTPUT_FORMAT_OPTIONS, type ImageOutputFormat } from "@/lib/api";
import { Input } from "@/components/ui/input";
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
      <div className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[11px] dark:border-border dark:bg-background/70">
        <span className="shrink-0 font-medium text-[#45515e] dark:text-muted-foreground">格式</span>
        <select
          value={imageOutputFormat}
          onChange={(event) => {
            const nextFormat = event.target.value as ImageOutputFormat;
            onImageOutputFormatChange(nextFormat);
            if (nextFormat === "png") {
              onImageOutputCompressionChange("");
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-right text-xs font-semibold text-[#18181b] outline-none dark:text-foreground"
          aria-label="图片输出格式"
        >
          {IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <label
        className={cn(
          "flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[11px] dark:border-border dark:bg-background/70",
          compressionDisabled && "opacity-55",
        )}
        title={compressionDisabled ? "PNG 不支持压缩率参数" : "JPEG / WebP 压缩率，0-100"}
      >
        <span className="shrink-0 font-medium text-[#45515e] dark:text-muted-foreground">压缩率</span>
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
          className="h-7 w-[4.25rem] border-0 bg-transparent px-0 text-right text-xs font-semibold text-[#18181b] shadow-none focus-visible:ring-0 disabled:cursor-not-allowed dark:text-foreground"
        />
      </label>
      <div className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[11px] dark:border-border dark:bg-background/70">
        <span className="shrink-0 font-medium text-[#45515e] dark:text-muted-foreground">输出</span>
        <span className="min-w-0 truncate text-right text-xs font-semibold text-[#18181b] dark:text-foreground">
          {compressionDisabled || !imageOutputCompression.trim()
            ? imageOutputFormatLabel
            : `${imageOutputFormatLabel} / ${imageOutputCompression.trim()}`}
        </span>
      </div>
    </>
  );
}
