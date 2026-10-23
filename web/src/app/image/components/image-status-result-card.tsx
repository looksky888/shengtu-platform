import { AlertCircle, Clock3 } from "lucide-react";

import { CreationTaskMessageState, CreationTaskProgressState } from "@/components/creation-task-state";
import type { ImageTurn, StoredImage } from "@/store/image-conversations";

type ImageStatusResultCardProps = {
  conversationId: string;
  turn: ImageTurn;
  image: StoredImage;
  imageIndex: number;
  turnBusy: boolean;
  elapsedClock: string;
  onRetryImage: (conversationId: string, turnId: string, imageIndex: number) => void | Promise<void>;
};

export function ImageStatusResultCard({
  conversationId,
  turn,
  image,
  imageIndex,
  turnBusy,
  elapsedClock,
  onRetryImage,
}: ImageStatusResultCardProps) {
  if (image.status === "cancelled") {
    return (
      <div className="mb-3 inline-flex min-h-[200px] w-full break-inside-avoid items-center justify-center overflow-hidden rounded-xl border border-amber-500/25 bg-amber-500/8 sm:mb-4">
        <CreationTaskMessageState
          icon={<Clock3 className="size-5 text-amber-600 dark:text-amber-400" />}
          title="任务已终止"
          detail={image.error || "本次图片任务已停止，可调整参数后重新生成。"}
        />
      </div>
    );
  }

  if (image.status === "error") {
    return (
      <div className="mb-3 inline-flex min-h-[200px] w-full break-inside-avoid items-center justify-center overflow-hidden rounded-xl border border-rose-500/25 bg-rose-500/8 sm:mb-4">
        <CreationTaskMessageState
          icon={<AlertCircle className="size-5 text-rose-600 dark:text-rose-400" />}
          title="图片生成失败"
          detail={image.error || "生成失败"}
          actionLabel="重试"
          actionDisabled={turnBusy || !turn.prompt.trim()}
          onAction={() => void onRetryImage(conversationId, turn.id, imageIndex)}
        />
      </div>
    );
  }

  return (
    <div className="animate-shimmer mb-3 inline-flex min-h-[210px] w-full break-inside-avoid items-center justify-center overflow-hidden rounded-xl border border-border/75 bg-surface-muted/70 sm:mb-4">
      <CreationTaskProgressState
        compact
        progress={0}
        indeterminate
        stage={
          turn.mode === "chat"
            ? turn.status === "queued" ? "已加入当前对话队列" : "正在等待回复"
            : turn.status === "queued" ? "已加入当前对话队列" : "正在处理图片"
        }
        elapsedLabel={elapsedClock}
      />
    </div>
  );
}
