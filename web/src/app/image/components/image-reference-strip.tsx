import { useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";

import { ImageLightbox } from "@/components/image-lightbox";

type ReferenceImage = {
  name: string;
  dataUrl: string;
};

type ImageReferenceStripProps = {
  visible: boolean;
  referenceImages: ReferenceImage[];
  onRemoveReferenceImage: (index: number) => void;
  onClearReferenceImages?: () => void;
};

export function ImageReferenceStrip({
  visible,
  referenceImages,
  onRemoveReferenceImage,
  onClearReferenceImages,
}: ImageReferenceStripProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxImages = useMemo(
    () =>
      referenceImages.map((image, index) => ({
        id: `${image.name}-${index}`,
        src: image.dataUrl,
        downloadName: image.name,
      })),
    [referenceImages],
  );

  if (!visible || referenceImages.length <= 1) {
    return null;
  }

  return (
    <>
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
      <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-border/75 bg-surface/92 px-2.5 py-2 shadow-xs backdrop-blur-md dark:border-white/[0.08] dark:bg-[#18191e]/95">
        <div className="hide-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5">
          {referenceImages.map((image, index) => (
            <div
              key={`${image.name}-${index}`}
              className="group/ref relative size-13 shrink-0 sm:size-14"
            >
              <button
                type="button"
                onClick={() => {
                  setLightboxIndex(index);
                  setLightboxOpen(true);
                }}
                className="block size-13 overflow-hidden rounded-xl border border-border/80 bg-surface-muted transition hover:border-foreground/35 sm:size-14 dark:border-white/[0.12]"
                aria-label={`预览参考图 ${image.name || index + 1}`}
                title={image.name || `参考图 ${index + 1}`}
              >
                <img
                  src={image.dataUrl}
                  alt={image.name || `参考图 ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 font-mono text-[9px] font-medium text-white tabular-nums">
                  #{index + 1}
                </span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveReferenceImage(index);
                }}
                className="absolute -top-1 -right-1 z-10 inline-flex size-4.5 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-2xs transition hover:border-foreground/30 hover:text-foreground dark:border-white/[0.15] dark:bg-[#22242c]"
                aria-label={`移除参考图 ${image.name || index + 1}`}
                title="移除此参考图"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>

        {onClearReferenceImages ? (
          <button
            type="button"
            onClick={onClearReferenceImages}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-rose-600 dark:hover:bg-white/[0.06] dark:hover:text-rose-400"
            title="清空全部参考图"
          >
            <Trash2 className="size-3" />
            <span>清空 ({referenceImages.length})</span>
          </button>
        ) : null}
      </div>
    </>
  );
}
