import type { ImageSizeSelection } from "@/app/image/image-options";
import type { ImageModel } from "@/lib/api";
import type { ImageTurn, StoredReferenceImage } from "@/store/image-conversations";

export type ComposerRecallState = {
  prompt: string;
  composerMode: "chat" | "image";
  model: ImageModel;
  channelModelId: string;
  count: string;
  sizeSelection: ImageSizeSelection;
  quality: "low" | "medium" | "high";
  outputFormat: "png" | "jpeg" | "webp";
  outputCompression: string;
  visibility: "private" | "public";
  referenceImages: StoredReferenceImage[];
};

export function buildComposerRecallState(turn: ImageTurn, fallbackImageModel: ImageModel, fallbackTextModel: ImageModel): ComposerRecallState {
  const isChat = turn.mode === "chat";
  const sizeSelection = recalledSizeSelection(isChat ? undefined : turn.sizeSelection, turn.size);
  const rawCount = Math.floor(Number(turn.count || turn.images.length || 1));
  const safeCount = Number.isFinite(rawCount) && rawCount >= 1 ? Math.min(15, rawCount) : 1;
  return {
    prompt: turn.prompt,
    composerMode: isChat ? "chat" : "image",
    model: turn.model || (isChat ? fallbackTextModel : fallbackImageModel),
    channelModelId: isChat ? "" : turn.channelModelId || "",
    count: isChat ? "1" : String(safeCount),
    sizeSelection,
    quality: turn.quality || "high",
    outputFormat: turn.outputFormat || "png",
    outputCompression: turn.outputCompression == null ? "" : String(turn.outputCompression),
    visibility: turn.visibility || "private",
    referenceImages: isChat ? [] : turn.referenceImages,
  };
}

function recalledSizeSelection(stored: ImageTurn["sizeSelection"], fallbackSize: string): ImageSizeSelection {
  const match = String(fallbackSize || "").match(/^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/);
  const fallbackWidth = match?.[1] || "1024";
  const fallbackHeight = match?.[2] || "1024";
  const mode = stored?.mode === "ratio" || stored?.mode === "custom" ? stored.mode : "auto";
  const aspectRatio = ["", "1:1", "3:2", "2:3", "16:9", "21:9", "4:3", "3:4", "9:16", "custom"].includes(stored?.aspectRatio || "")
    ? stored?.aspectRatio || ""
    : "";
  const resolution = ["auto", "1k", "1080p", "2k", "4k"].includes(stored?.resolution || "")
    ? stored?.resolution || "auto"
    : "auto";
  return {
    mode,
    aspectRatio: aspectRatio as ImageSizeSelection["aspectRatio"],
    resolution: resolution as ImageSizeSelection["resolution"],
    customRatio: stored?.customRatio || "16:9",
    customWidth: stored?.customWidth || fallbackWidth,
    customHeight: stored?.customHeight || fallbackHeight,
  };
}
