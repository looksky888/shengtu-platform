import { useCallback, useRef } from "react";

export function useImagePageControllerRefs() {
  const promptApplyRequestIdRef = useRef(0);

  return {
    isSubmitDispatchingRef: useRef(false),
    cancelledTurnIdsRef: useRef(new Set<string>()),
    resultsViewportRef: useRef<HTMLDivElement>(null),
    composerDockRef: useRef<HTMLDivElement>(null),
    textareaRef: useRef<HTMLTextAreaElement>(null),
    promptApplyRequestIdRef,
    cancelPromptApplyRequest: useCallback(() => {
      promptApplyRequestIdRef.current += 1;
    }, []),
  };
}
