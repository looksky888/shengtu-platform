import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { icloudApi } from "@/lib/icloud-api";

import { SectionCard, SectionLoadError } from "./icloud-cards";
import type { ICloudPageController } from "./use-icloud-page";

const AUTO_CHANNEL = "__auto__";

export function ICloudCreatePanels({
  controller,
}: {
  controller: ICloudPageController;
}) {
  const {
    busy,
    selectedAccountIds,
    loadErrors,
    createLabel,
    setCreateLabel,
    createChannel,
    setCreateChannel,
    createNote,
    setCreateNote,
    createMailboxes,
    scheduler,
    setScheduler,
    schedChannel,
    setSchedChannel,
    schedInterval,
    setSchedInterval,
    startScheduler,
  } = controller;

  async function stopScheduler() {
    try {
      const result = await icloudApi.stopScheduler();
      setScheduler(result.scheduler || null);
      toast.success("已停止");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "停止定时创建失败");
    }
  }

  return (
    <>
      <SectionCard title="创建隐私邮箱">
        <Input
          aria-label="邮箱标签"
          placeholder="邮箱标签"
          value={createLabel}
          onChange={(event) => setCreateLabel(event.target.value)}
        />
        <Select
          value={createChannel || AUTO_CHANNEL}
          onValueChange={(value) =>
            setCreateChannel(value === AUTO_CHANNEL ? "" : value)
          }
        >
          <SelectTrigger aria-label="隐私邮箱创建通道" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO_CHANNEL}>自动选择通道</SelectItem>
            <SelectItem value="apple_account">新接口（推荐）</SelectItem>
            <SelectItem value="icloud_web">旧接口</SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="隐私邮箱备注"
          placeholder="备注（可选）"
          value={createNote}
          onChange={(event) => setCreateNote(event.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            已选 {selectedAccountIds.length} 个账号 · 下次自动恢复
          </span>
          <Button
            variant="brand"
            disabled={busy || selectedAccountIds.length === 0}
            onClick={() => void createMailboxes()}
          >
            创建邮箱
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="定时创建"
        action={
          <Badge variant={scheduler?.running ? "success" : "secondary"}>
            {scheduler?.running ? "运行中" : "未启动"}
          </Badge>
        }
      >
        <SectionLoadError message={loadErrors.scheduler} />
        <Select
          value={schedChannel || AUTO_CHANNEL}
          onValueChange={(value) =>
            setSchedChannel(value === AUTO_CHANNEL ? "" : value)
          }
          disabled={Boolean(scheduler?.running)}
        >
          <SelectTrigger aria-label="定时创建通道" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO_CHANNEL}>自动新旧接口</SelectItem>
            <SelectItem value="apple_account">只用新接口</SelectItem>
            <SelectItem value="icloud_web">只用旧接口</SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="定时创建间隔（秒）"
          type="number"
          min={60}
          value={schedInterval}
          onChange={(event) =>
            setSchedInterval(Number(event.target.value) || 60)
          }
          disabled={Boolean(scheduler?.running)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="brand"
            disabled={
              busy ||
              Boolean(scheduler?.running) ||
              selectedAccountIds.length === 0
            }
            onClick={() => void startScheduler()}
          >
            启动定时创建
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !scheduler?.running}
            onClick={() => void stopScheduler()}
          >
            停止
          </Button>
        </div>
        {scheduler?.last_error ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {scheduler.last_error}
          </p>
        ) : null}
      </SectionCard>
    </>
  );
}
