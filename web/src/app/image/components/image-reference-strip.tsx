import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { ImageLightbox } from "@/components/image-lightbox";

type ReferenceImage = {
  name: string;
  dataUrl: string;
};

type ImageReferenceStripProps = {
  visible: boolean;
  referenceImages: ReferenceImage[];
  onRemoveReferenceImage: (index: number) => void;
};

export function ImageReferenceStrip({
  visible,
  referenceImages,
  onRemoveReferenceImage,
}: ImageReferenceStripProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxImages = useMemo(
    () => referenceImages.map((image, index) => ({ id: `${image.name}-${index}`, src: image.dataUrl, downloadName: image.name })),
    [referenceImages],
  );

  if (!visible || referenceImages.length === 0) {
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
      <div className="hide-scrollbar mb-2 flex max-h-20 gap-2 overflow-x-auto px-1 py-1 sm:mb-3">
        {referenceImages.map((image, index) => (
          <div key={`${image.name}-${index}`} className="relative size-14 shrink-0 sm:size-16">
            <button
              type="button"
              onClick={() => {
                setLightboxIndex(index);
                setLightboxOpen(true);
              }}
              className="group size-14 overflow-hidden rounded-xl border border-border/80 bg-surface-muted transition hover:border-foreground/30 sm:size-16"
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
              onClick={(event) => {
                event.stopPropagation();
                onRemoveReferenceImage(index);
              }}
              className="absolute -right-1 -top-1 z-10 inline-flex size-5 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-2xs transition hover:border-foreground/30 hover:text-foreground"
              aria-label={`移除参考图 ${image.name || index + 1}`}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
