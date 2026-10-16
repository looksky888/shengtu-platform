import type { Dispatch, RefObject, SetStateAction } from "react";

import type { EditingTurnDraft } from "@/app/image/lib/image-page-types";
import type { ImageLightboxItem } from "@/app/image/components/image-results";
import type { ImageModel } from "@/lib/api";

export type SetEditingTurnDraft = Dispatch<SetStateAction<EditingTurnDraft | null>>;

export type ModelOption = {
  id: string;
  value: ImageModel;
  label: string;
  channelModelId?: string;
  channelName?: string;
};

export type ReferenceImageLightboxHandler = (images: ImageLightboxItem[], index: number) => void;

export type EditReferenceImageProps = {
  draft: EditingTurnDraft;
  editFileInputRef: RefObject<HTMLInputElement | null>;
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
  onRemoveReferenceImage: (index: number) => void;
  onOpenLightbox: ReferenceImageLightboxHandler;
};
