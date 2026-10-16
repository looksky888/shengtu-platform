"use client";

import { LoaderCircle } from "lucide-react";

import { ProfileContent } from "@/app/profile/profile-content";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function ProfilePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/profile");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  return <ProfileContent session={session} />;
}
