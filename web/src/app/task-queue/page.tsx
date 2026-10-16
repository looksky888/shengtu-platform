"use client";

import { LoaderCircle } from "lucide-react";

import { TaskQueueContent } from "@/app/task-queue/task-queue-content";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function TaskQueuePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/task-queue");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        正在校验权限...
      </div>
    );
  }
  return <TaskQueueContent session={session} />;
}
