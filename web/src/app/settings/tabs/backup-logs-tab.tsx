import { FileClock, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { BackupSettingsCard } from "../components/backup-settings-card";
import { LogGovernanceCard } from "../components/log-governance-card";

export default function BackupLogsTab() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border/80 bg-surface px-5 py-4 shadow-2xs">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-foreground sm:text-[15px]">
            审计日志与创作队列入口
          </div>
          <p className="text-xs text-muted-foreground">
            支持快速跳转系统请求审计日志检索台或创作任务执行历史
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs">
            <Link to="/logs">
              <FileClock className="size-3.5" />
              日志管理
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs">
            <Link to="/task-queue?tab=history">
              <ListChecks className="size-3.5" />
              任务历史
            </Link>
          </Button>
        </div>
      </div>

      <div id="settings-section-backup-policy">
        <BackupSettingsCard />
      </div>
      <div id="settings-section-backup-logs">
        <LogGovernanceCard />
      </div>
    </section>
  );
}
