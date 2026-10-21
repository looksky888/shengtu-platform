import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ImageTurn, StoredImage } from "@/store/image-conversations";

type TextReplyItem = {
  image: StoredImage;
  index: number;
};

type ImageTextRepliesProps = {
  conversationId: string;
  turn: ImageTurn;
  turnBusy: boolean;
  textReplyImages: TextReplyItem[];
  onRetryImage: (conversationId: string, turnId: string, imageIndex: number) => void | Promise<void>;
};

export function ImageTextReplies({
  conversationId,
  turn,
  turnBusy,
  textReplyImages,
  onRetryImage,
}: ImageTextRepliesProps) {
  if (textReplyImages.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-col gap-2">
      {textReplyImages.map(({ image, index }) => (
        <div
          key={image.id}
          className="w-full max-w-[min(94%,760px)] rounded-xl border border-border/70 bg-card px-4 py-3 text-left text-sm leading-6 text-foreground shadow-2xs"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded-md bg-muted px-2 py-0.5 text-foreground/80">
                {turn.mode === "chat" ? "对话回复" : "模型文本回复"}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs"
              disabled={turnBusy || !turn.prompt.trim()}
              onClick={() => void onRetryImage(conversationId, turn.id, index)}
            >
              <RotateCcw className="size-3.5" />
              {turn.mode === "chat" ? "重新发送" : "重试生成"}
            </Button>
          </div>
          <div className="whitespace-pre-wrap break-words">{image.text_response}</div>
        </div>
      ))}
    </div>
  );
}
