import { useCallback, useState } from "react";
import { toast } from "sonner";

import { clearImageManagerCache } from "@/lib/image-manager-cache";
import { getManagedImagePathFromUrl } from "@/lib/image-path";
import { updateManagedImageVisibility, type ImageVisibility } from "@/lib/api";
import type { ImageConversation } from "@/store/image-conversations";

type UpdateConversation = (
  conversationId: string,
  updater: (current: ImageConversation | null) => ImageConversation,
  options?: { persist?: boolean },
) => Promise<void>;

type UseImageVisibilityActionsParams = {
  conversationsRef: { current: ImageConversation[] };
  updateConversation: UpdateConversation;
};

export function useImageVisibilityActions({ conversationsRef, updateConversation }: UseImageVisibilityActionsParams) {
  const [visibilityMutatingImageKey, setVisibilityMutatingImageKey] = useState("");

  const handleImageVisibilityChange = useCallback(
    async (conversationId: string, turnId: string, imageIndex: number, visibility: ImageVisibility) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      const targetImage = targetTurn?.images[imageIndex];
      if (!targetConversation || !targetTurn || !targetImage) {
        toast.error("未找到对应的图片记录");
        return;
      }
      if (targetImage.status !== "success") {
        toast.error("图片生成成功后才能修改公开状态");
        return;
      }
      const path = targetImage.path || (targetImage.url ? getManagedImagePathFromUrl(targetImage.url) : "");
      if (!path) {
        toast.error("未找到可同步到图库的图片路径");
        return;
      }

      const mutatingKey = `${conversationId}:${turnId}:${targetImage.id}`;
      if (visibilityMutatingImageKey) return;
      setVisibilityMutatingImageKey(mutatingKey);
      try {
        const data = await updateManagedImageVisibility(path, visibility);
        const updatedVisibility = data.item.visibility || visibility;
        const updatedPath = data.item.path || path;
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? targetConversation;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    images: turn.images.map((image, index) =>
                      index === imageIndex ? { ...image, path: updatedPath, visibility: updatedVisibility } : image,
                    ),
                  }
                : turn,
            ),
          };
        });
        clearImageManagerCache();
        toast.success(updatedVisibility === "public" ? "已公开到图库" : "已取消公开");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "更新公开状态失败");
      } finally {
        setVisibilityMutatingImageKey("");
      }
    },
    [conversationsRef, updateConversation, visibilityMutatingImageKey],
  );

  return { visibilityMutatingImageKey, handleImageVisibilityChange };
}
