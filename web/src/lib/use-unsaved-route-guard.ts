import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type UseUnsavedRouteGuardOptions = {
  when: boolean;
  onSave: () => Promise<boolean> | boolean;
  onDiscard?: () => Promise<boolean | void> | boolean | void;
};

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function useUnsavedRouteGuard({
  when,
  onSave,
  onDiscard,
}: UseUnsavedRouteGuardOptions) {
  const navigate = useNavigate();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const whenRef = useRef(when);
  whenRef.current = when;

  useEffect(() => {
    if (!when) {
      setPendingHref(null);
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const handleCaptureClick = (event: MouseEvent) => {
      if (!whenRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.protocol !== "http:" && url.protocol !== "https:") return;

      const currentPath = normalizePathname(window.location.pathname);
      const nextPath = normalizePathname(url.pathname);
      if (nextPath === currentPath) return;

      event.preventDefault();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleCaptureClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleCaptureClick, true);
    };
  }, [when]);

  const cancelLeave = useCallback(() => {
    if (isSaving || isDiscarding) return;
    setPendingHref(null);
  }, [isDiscarding, isSaving]);

  const confirmSaveAndLeave = useCallback(async () => {
    if (!pendingHref || isSaving || isDiscarding) return;
    setIsSaving(true);
    try {
      const ok = await onSave();
      if (!ok) return;
      const destination = pendingHref;
      setPendingHref(null);
      navigate(destination);
    } finally {
      setIsSaving(false);
    }
  }, [isDiscarding, isSaving, navigate, onSave, pendingHref]);

  const confirmDiscardAndLeave = useCallback(async () => {
    if (!pendingHref || isSaving || isDiscarding) return;
    setIsDiscarding(true);
    try {
      if (onDiscard) {
        const result = await onDiscard();
        if (result === false) return;
      }
      const destination = pendingHref;
      setPendingHref(null);
      navigate(destination);
    } finally {
      setIsDiscarding(false);
    }
  }, [isDiscarding, isSaving, navigate, onDiscard, pendingHref]);

  return {
    isOpen: Boolean(pendingHref),
    pendingHref,
    isSaving,
    isDiscarding,
    cancelLeave,
    confirmSaveAndLeave,
    confirmDiscardAndLeave,
  };
}
