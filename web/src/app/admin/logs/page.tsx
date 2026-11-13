"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { LogsContent } from "@/app/logs/page";
import { TaskQueueContent } from "@/app/task-queue/task-queue-content";
import { AdminPageFrame, AdminUnderlineTabs } from "@/components/admin";
import { useAuthGuard } from "@/lib/use-auth-guard";

type LogsAdminTab = "tasks" | "system";

const LOGS_TABS = [
  { value: "tasks" as const, label: "生成任务与队列监控（含隔离账号 iCloud 取码恢复）" },
  { value: "system" as const, label: "系统请求与审计日志" },
] as const;

export default function AdminLogsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/logs");
  const [activeTab, setActiveTab] = useState<LogsAdminTab>("tasks");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  return (
    <AdminPageFrame
      groupLabel="商业与运营"
      title="请求与审计"
      description="实时监听生成队列并发负载、处置隔离舱账号与 iCloud 取码恢复，并检索全站 API 请求审计轨迹。"
    >
      <AdminUnderlineTabs
        items={LOGS_TABS}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="tasks"
      />

      {activeTab === "tasks" ? (
        <TaskQueueContent session={session} embedded />
      ) : (
        <LogsContent embedded />
      )}
    </AdminPageFrame>
  );
}
