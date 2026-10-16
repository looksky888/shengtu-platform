import { PencilLine, RotateCcw, Trash2 } from "lucide-react";

import type { ImageLightboxItem } from "@/app/image/components/image-results-types";
import { getTurnModeLabel, getTurnStatusLabel } from "@/app/image/components/image-results-utils";
import { CreationTaskCancelButton } from "@/components/creation-task-state";
import { Button } from "@/components/ui/button";
import type { ImageTurn } from "@/store/image-conversations";

type ImageTurnPromptCardProps = {
  conversationId: string;
  turn: ImageTurn;
  turnIndex: number;
  turnBusy: boolean;
  referenceLightboxImages: ImageLightboxItem[];
  formatConversationTime: (value: string) => string;
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onEditTurn: (conversationId: string, turnId: string) => void;
  onCancelTurn: (conversationId: string, turnId: string) => void | Promise<void>;
  onRegenerateTurn: (conversationId: string, turnId: string) => void | Promise<void>;
  onDeleteTurn: (conversationId: string, turnId: string, prompt: string) => void;
};

export function ImageTurnPromptCard({
  conversationId,
  turn,
  turnIndex,
  turnBusy,
  referenceLightboxImages,
  formatConversationTime,
  onOpenLightbox,
  onEditTurn,
  onCancelTurn,
  onRegenerateTurn,
  onDeleteTurn,
}: ImageTurnPromptCardProps) {
  return (
    <div className="flex justify-end">
      <article className="w-full max-w-[min(94%,760px)] rounded-[24px] border border-[#f2f3f5] bg-white px-4 py-3 text-left text-[14px] leading-6 text-[#222222] shadow-[0_4px_6px_rgba(0,0,0,0.08)] sm:px-5 sm:py-4 sm:text-[15px] sm:leading-7">
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-[#f2f3f5] pb-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-5 text-[#45515e]">
            <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]">第 {turnIndex + 1} 轮</span>
            <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]">{getTurnModeLabel(turn)}</span>
            <span className="max-w-full rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]" title={turn.modelLabel || turn.model}>{turn.modelLabel || turn.model}</span>
            <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]">{getTurnStatusLabel(turn.status)}</span>
            <span className="px-1 text-[#8e8e93]">{formatConversationTime(turn.createdAt)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {turnBusy ? (
              <CreationTaskCancelButton
                iconOnly
                className="size-8"
                onCancel={() => void onCancelTurn(conversationId, turn.id)}
                label="终止生成任务"
              />
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full border-[#e5e7eb] bg-white text-[#45515e] shadow-none hover:bg-black/[0.05]"
                  onClick={() => onEditTurn(conversationId, turn.id)}
                  aria-label="带回创作框编辑"
                  title="带回创作框编辑"
                >
                  <PencilLine className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full border-[#e5e7eb] bg-white text-[#45515e] shadow-none hover:bg-black/[0.05]"
                  disabled={turnBusy || !turn.prompt.trim()}
                  onClick={() => void onRegenerateTurn(conversationId, turn.id)}
                  aria-label="重新生成"
                  title="重新生成"
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full border-[#e5e7eb] bg-white text-[#8e8e93] shadow-none hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => onDeleteTurn(conversationId, turn.id, turn.prompt)}
                  aria-label="删除本轮创作记录"
                  title="删除本轮创作记录"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div>
          <div className="whitespace-pre-wrap break-words">{turn.prompt}</div>
          {turn.referenceImages.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-start gap-2">
              {turn.referenceImages.map((image, index) => (
                <button
                  key={`${turn.id}-${image.name}-${index}`}
                  type="button"
                  onClick={() => onOpenLightbox(referenceLightboxImages, index)}
                  className="group relative size-20 shrink-0 overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-100/60 text-left transition hover:border-stone-300 sm:size-24"
                  aria-label={`预览参考图 ${image.name || index + 1}`}
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name || `参考图 ${index + 1}`}
                    className="absolute inset-0 h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}
