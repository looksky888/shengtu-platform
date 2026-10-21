import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EditReferenceImageProps } from "@/app/image/components/edit-dialog/types";

export function ImageEditReferencePanel({
  draft,
  editFileInputRef,
  onReferenceImageChange,
  onRemoveReferenceImage,
  onOpenLightbox,
}: EditReferenceImageProps) {
  if (draft.mode === "chat") {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={editFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void onReferenceImageChange(Array.from(event.target.files || []));
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">参考图</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => editFileInputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          上传图片
        </Button>
      </div>
      {draft.referenceImages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {draft.referenceImages.map((image, index) => (
            <div key={`${image.name}-${index}`} className="relative size-20 shrink-0">
              <button
                type="button"
                className="size-20 overflow-hidden rounded-xl border border-border/70 bg-muted/40"
                onClick={() =>
                  onOpenLightbox(
                    draft.referenceImages.map((item, itemIndex) => ({
                      id: `${item.name}-${itemIndex}`,
                      src: item.dataUrl,
                    })),
                    index,
                  )
                }
                aria-label={`预览参考图 ${image.name || index + 1}`}
              >
                <img
                  src={image.dataUrl}
                  alt={image.name || `参考图 ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => onRemoveReferenceImage(index)}
                className="absolute -top-1 -right-1 z-10 inline-flex size-5 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground shadow-2xs transition hover:text-foreground"
                aria-label={`移除参考图 ${image.name || index + 1}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
