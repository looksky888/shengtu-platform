import { useEffect, useState } from "react";
import { toast } from "sonner";

import { updateProfileName } from "@/lib/api";
import { authSessionFromLoginResponse, setVerifiedAuthSession } from "@/lib/session";
import type { StoredAuthSession } from "@/store/auth";

export function useProfileAccount(session: StoredAuthSession) {
  const [currentSession, setCurrentSession] = useState(session);
  const [profileName, setProfileName] = useState(session.name || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const isProfileNameDirty = profileName.trim() !== (currentSession.name || "");

  useEffect(() => {
    setCurrentSession(session);
    setProfileName(session.name || "");
  }, [session]);

  const handleSaveProfile = async () => {
    const nextName = profileName.trim();
    if (!nextName) {
      toast.error("昵称不能为空");
      return;
    }
    if (!isProfileNameDirty) {
      return;
    }
    setIsSavingProfile(true);
    try {
      const data = await updateProfileName(nextName);
      const nextSession = authSessionFromLoginResponse(data, currentSession.key);
      await setVerifiedAuthSession(nextSession);
      setCurrentSession(nextSession);
      setProfileName(nextSession.name || "");
      toast.success("昵称已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存昵称失败");
    } finally {
      setIsSavingProfile(false);
    }
  };

  return {
    currentSession,
    profileName,
    isProfileNameDirty,
    isSavingProfile,
    setProfileName,
    handleSaveProfile,
  };
}
