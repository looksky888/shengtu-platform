"use client";

import { LoaderCircle } from "lucide-react";

import { UsersContent } from "@/app/users/users-content";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function UsersPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/users");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  return <UsersContent session={session} />;
}