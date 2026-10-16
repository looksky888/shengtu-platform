import { useCallback, useEffect, useState } from "react";

import {
  clearImageTurnProgress,
  getImageTurnProgressSnapshot,
  setImageTurnProgress,
  subscribeImageTurnProgress,
  type ImageTurnProgress,
} from "@/store/image-turn-progress";
import { usePageVisible } from "@/lib/use-page-visible";

type UseImageTurnProgressStateOptions = {
  activeTaskCount: number;
};

export function useImageTurnProgressState({ activeTaskCount }: UseImageTurnProgressStateOptions) {
  const [progressByTurnKey, setProgressByTurnKey] = useState<Record<string, ImageTurnProgress>>(
    getImageTurnProgressSnapshot,
  );
  const [progressNow, setProgressNow] = useState(Date.now());
  const pageVisible = usePageVisible();

  useEffect(
    () =>
      subscribeImageTurnProgress(() => {
        setProgressByTurnKey(getImageTurnProgressSnapshot());
      }),
    [],
  );

  useEffect(() => {
    if (!pageVisible || (activeTaskCount === 0 && Object.keys(progressByTurnKey).length === 0)) {
      return;
    }

    setProgressNow(Date.now());
    const timer = window.setInterval(() => {
      setProgressNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeTaskCount, pageVisible, progressByTurnKey]);

  const updateTurnProgress = useCallback(
    (conversationId: string, turnId: string, updates: Omit<ImageTurnProgress, "startedAt"> & { startedAt?: number }) => {
      setImageTurnProgress(conversationId, turnId, updates);
    },
    [],
  );

  const clearTurnProgress = useCallback((conversationId: string, turnId: string) => {
    clearImageTurnProgress(conversationId, turnId);
  }, []);

  return {
    progressByTurnKey,
    progressNow,
    updateTurnProgress,
    clearTurnProgress,
  };
}
