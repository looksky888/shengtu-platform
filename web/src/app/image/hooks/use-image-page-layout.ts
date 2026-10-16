import { useEffect, useState, type RefObject } from "react";

type UseImagePageLayoutOptions = {
  composerDockRef: RefObject<HTMLDivElement | null>;
  resultsViewportRef: RefObject<HTMLDivElement | null>;
  selectedConversationId: string | null;
  selectedTurnCount?: number;
};

export function useImagePageLayout({
  composerDockRef,
  resultsViewportRef,
  selectedConversationId,
  selectedTurnCount,
}: UseImagePageLayoutOptions) {
  const [composerDockHeight, setComposerDockHeight] = useState(0);

  useEffect(() => {
    const node = composerDockRef.current;
    if (!node) {
      return;
    }

    const updateComposerHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setComposerDockHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    };

    updateComposerHeight();
    const observer = new ResizeObserver(updateComposerHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [composerDockRef]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const viewport = resultsViewportRef.current;
    viewport?.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [resultsViewportRef, selectedConversationId, selectedTurnCount]);

  return composerDockHeight;
}
