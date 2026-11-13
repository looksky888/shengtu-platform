import { useEffect, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PENDING_STUDIO_PROMPT_STORAGE_KEY } from "@/app/landing/landing-brand";
import { useAuthGuard } from "@/lib/use-auth-guard";

type ImagePageShellProps = {
  children: ReactNode;
};

export function ImagePageShell({ children }: ImagePageShellProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const incomingPrompt = (searchParams.get("prompt") || "").trim();

  useEffect(() => {
    if (!incomingPrompt || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(PENDING_STUDIO_PROMPT_STORAGE_KEY, incomingPrompt);
    } catch {
      // Ignore storage restrictions.
    }
  }, [incomingPrompt]);

  const { isCheckingAuth, session } = useAuthGuard(undefined, "/image");

  useEffect(() => {
    if (!isCheckingAuth && !session && incomingPrompt) {
      navigate(`/login?prompt=${encodeURIComponent(incomingPrompt)}`, { replace: true });
    }
  }, [incomingPrompt, isCheckingAuth, navigate, session]);

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
