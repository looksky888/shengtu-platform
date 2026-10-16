"use client";

import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuthGuard } from "@/lib/use-auth-guard";

/**
 * Legacy route: 任务历史已并入「任务中心」Tab。
 * Keep path for RBAC menu permissions; redirect to unified hub.
 */
export default function ImageTaskLogsPage() {
  const navigate = useNavigate();
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/image-task-logs");

  useEffect(() => {
    if (!isCheckingAuth && session) {
      navigate("/task-queue?tab=history", { replace: true });
    }
  }, [isCheckingAuth, navigate, session]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-4 animate-spin" />
      正在跳转到任务中心 · 历史...
    </div>
  );
}
