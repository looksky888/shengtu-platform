"use client";

import { LoaderCircle } from "lucide-react";

import { ImageManagerContent } from "@/app/image-manager/image-manager-content";
import { imageManagerCacheScope } from "@/app/image-manager/image-manager-utils";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { hasAPIPermission } from "@/store/auth";

export default function ImageManagerPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/image-manager");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  const canDeleteImages = hasAPIPermission(session, "DELETE", "/api/images");
  return (
    <ImageManagerContent
      cacheScope={imageManagerCacheScope(session)}
      canDeleteImages={canDeleteImages}
      isAdmin={session.role === "admin"}
    />
  );
}