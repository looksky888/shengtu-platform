import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { fetchProfileInvite, type ProfileInviteInfo } from "@/lib/api";

export function useProfileInvite() {
  const [inviteInfo, setInviteInfo] = useState<ProfileInviteInfo | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);

  const inviteLink = useMemo(() => {
    if (!inviteInfo?.link) {
      return "";
    }
    if (/^https?:\/\//.test(inviteInfo.link)) {
      return inviteInfo.link;
    }
    if (typeof window === "undefined") {
      return inviteInfo.link;
    }
    try {
      return new URL(inviteInfo.link, window.location.origin).toString();
    } catch {
      return inviteInfo.link;
    }
  }, [inviteInfo]);

  const loadInvite = useCallback(async (notifyOnError = true) => {
    setIsLoadingInvite(true);
    setInviteError("");
    try {
      const data = await fetchProfileInvite();
      setInviteInfo(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载邀请信息失败";
      setInviteError(message);
      if (notifyOnError) {
        toast.error(message);
      }
    } finally {
      setIsLoadingInvite(false);
    }
  }, []);

  return {
    inviteInfo,
    inviteLink,
    inviteError,
    isLoadingInvite,
    loadInvite,
  };
}
