import {
  Activity,
  Download,
  Gauge,
  LoaderCircle,
  Network,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  WandSparkles,
  Webhook,
} from "lucide-react";

import type { GrokConfigDialogKind } from "@/app/accounts/grok-provider-config-dialog";
import { GrokAllProvidersIcon, GrokProviderIcon } from "@/app/accounts/grok-provider-icons";
import type { GrokProviderCenterController } from "@/app/accounts/use-grok-provider-center";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubNav } from "@/components/ui/sub-nav";
import { cn } from "@/lib/utils";

type Props = {
  controller: GrokProviderCenterController;
  canWrite: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  onImport: () => void;
  onConfigure: (kind: GrokConfigDialogKind) => void;
  onDelete: () => void;
};

export function GrokProviderToolbar({
  controller,
  canWrite,
  canDelete,
  isAdmin,
  onImport,
  onConfigure,
  onDelete,
}: Props) {
  const selected = controller.selectedAccounts.length;
  const scoped = selected > 0 && Boolean(controller.selectedProvider);
  const disabled = controller.busy || !canWrite;
  const tabs = [
    {
      value: "all" as const,
      label: "全部",
      badge: controller.data?.summary.total ?? "—",
      icon: ({ className }: { className?: string }) => (
        <GrokAllProvidersIcon className={className} />
      ),
    },
    {
      value: "build" as const,
      label: "Build",
      badge: controller.data?.summary.by_provider.build ?? "—",
      icon: ({ className }: { className?: string }) => (
        <GrokProviderIcon provider="build" className={className} />
      ),
    },
    {
      value: "web" as const,
      label: "Web",
      badge: controller.data?.summary.by_provider.web ?? "—",
      icon: ({ className }: { className?: string }) => (
        <GrokProviderIcon provider="web" className={className} />
      ),
    },
    {
      value: "console" as const,
      label: "Console",
      badge: controller.data?.summary.by_provider.console ?? "—",
      icon: ({ className }: { className?: string }) => (
        <GrokProviderIcon provider="console" className={className} />
      ),
    },
  ] as const;

  return (
    <div className="grid gap-3 border-b border-border/70 p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          ariaLabel="Grok Provider 类型筛选"
          items={tabs}
          value={controller.provider}
          onValueChange={controller.setProvider}
          layoutId="grok-provider-subnav"
        />
        <Button variant="brand" disabled={disabled} onClick={onImport}>
          <Plus className="size-4" />
          <span>账号接入</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="搜索 Grok Provider 账号"
          className="min-w-52 flex-1 sm:max-w-xs"
          placeholder="搜索账号、掩码邮箱或来源…"
          value={controller.keyword}
          onChange={(event) => controller.setKeyword(event.target.value)}
        />
        <Select
          value={controller.status}
          onValueChange={(value) =>
            controller.setStatus(value as typeof controller.status)
          }
        >
          <SelectTrigger aria-label="Provider 状态筛选" className="w-[136px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">可用</SelectItem>
            <SelectItem value="disabled">已停用</SelectItem>
            <SelectItem value="error">异常</SelectItem>
            <SelectItem value="unknown">待检测</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={controller.loading}
          onClick={() => void controller.load()}
        >
          <RefreshCw
            className={cn("size-4", controller.loading && "animate-spin")}
          />
          <span>刷新</span>
        </Button>
      </div>

      {selected > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-brand-border bg-brand-soft/60 p-2.5">
          <span className="mr-1 px-1.5 text-xs font-medium text-foreground">
            已选 {selected} 个
            {!scoped ? " · 批量操作需保持同一 Provider" : ""}
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !scoped}
            onClick={() => controller.setEnabled(true)}
          >
            <Power className="size-3.5" />
            启用
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !scoped}
            onClick={() => controller.setEnabled(false)}
          >
            <PowerOff className="size-3.5" />
            停用
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !scoped}
            onClick={() => onConfigure("concurrency")}
          >
            <Gauge className="size-3.5" />
            并发
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !scoped}
            onClick={() => onConfigure("egress")}
          >
            <Network className="size-3.5" />
            出口
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !scoped}
            onClick={() => controller.syncQuota()}
          >
            <Activity className="size-3.5" />
            同步额度
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !scoped}
            onClick={() => controller.detect()}
          >
            <ShieldCheck className="size-3.5" />
            检测
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={
              disabled || !scoped || controller.selectedProvider !== "web"
            }
            onClick={() => controller.convert("console")}
          >
            <Webhook className="size-3.5" />
            转 Console
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={
              disabled || !scoped || controller.selectedProvider !== "web"
            }
            onClick={() => controller.convert("build")}
          >
            <WandSparkles className="size-3.5" />
            转 Build
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !scoped}
            onClick={() => void controller.exportAccounts("redacted")}
          >
            <Download className="size-3.5" />
            脱敏导出
          </Button>
          {isAdmin ? (
            <Button
              size="xs"
              variant="outline"
              disabled={disabled || !scoped}
              onClick={() => void controller.exportAccounts("credentials")}
            >
              <Settings2 className="size-3.5" />
              完整凭据
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="destructive-outline"
            disabled={controller.busy || !canDelete || !scoped}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
          {controller.busy ? (
            <span className="inline-flex items-center gap-1 px-1.5 text-xs text-brand">
              <LoaderCircle className="size-3.5 animate-spin" />
              任务执行中
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
