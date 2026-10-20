import { Network } from "lucide-react";

import { GrokProviderAccountCell } from "@/app/accounts/grok-provider-account-cell";
import { accountDisplayTime, capabilityLabel } from "@/app/accounts/grok-provider-account-model";
import type { GrokConfigDialogKind } from "@/app/accounts/grok-provider-config-dialog";
import { GrokProviderQuota } from "@/app/accounts/grok-provider-quota";
import { GrokProviderRowActions } from "@/app/accounts/grok-provider-row-actions";
import {
  GrokProviderCredential,
  GrokProviderStatusBadge,
  GrokProviderTime,
  GrokProviderTypeBadge,
} from "@/app/accounts/grok-provider-status";
import type {
  GrokProviderCenterController,
  GrokProviderRow,
} from "@/app/accounts/use-grok-provider-center";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  controller: GrokProviderCenterController;
  canWrite: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  onConfigure: (
    kind: Exclude<GrokConfigDialogKind, null>,
    account: GrokProviderRow
  ) => void;
  onDelete: (account: GrokProviderRow) => void;
};

function RouteCell({ account }: { account: GrokProviderRow }) {
  const egress =
    account.egress.mode === "proxy"
      ? account.egress.identity
      : account.egress.mode === "direct"
        ? "直连"
        : "继承系统";
  return (
    <div className="grid gap-1 text-xs">
      <span>并发 {account.max_concurrent}</span>
      <span
        className="inline-flex items-center gap-1 truncate text-muted-foreground"
        title={egress}
      >
        <Network className="size-3" />
        {egress}
      </span>
    </div>
  );
}

function CapabilityCell({ account }: { account: GrokProviderRow }) {
  return (
    <div className="flex max-w-48 flex-wrap gap-1">
      {account.capabilities.map((item) => (
        <Badge key={item} variant="outline" className="rounded-full font-normal">
          {capabilityLabel(item)}
        </Badge>
      ))}
    </div>
  );
}

function MobileAccountCard({
  account,
  props,
}: {
  account: GrokProviderRow;
  props: Props;
}) {
  const time = accountDisplayTime(account);
  return (
    <article className="grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs">
      <div className="flex items-start gap-3">
        <Checkbox
          aria-label={`选择 ${account.display_name || account.id}`}
          className="mt-1"
          checked={props.controller.selected.includes(account.id)}
          onCheckedChange={(value) =>
            props.controller.toggle(account.id, value === true)
          }
        />
        <div className="min-w-0 flex-1">
          <GrokProviderAccountCell account={account} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <GrokProviderTypeBadge account={account} />
            <GrokProviderStatusBadge account={account} />
          </div>
        </div>
        <GrokProviderRowActions account={account} {...props} />
      </div>
      <div className="rounded-xl bg-surface-muted/60 p-3">
        <div className="mb-2 text-xs text-muted-foreground">额度</div>
        <GrokProviderQuota account={account} />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border/70 pt-3">
        <RouteCell account={account} />
        <GrokProviderCredential account={account} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/70 pt-3">
        <CapabilityCell account={account} />
        <GrokProviderTime {...time} />
      </div>
    </article>
  );
}

export function GrokProviderTable(props: Props) {
  const { controller } = props;
  const items = controller.data?.items || [];
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="bg-surface-muted/65 text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3">
                <Checkbox
                  aria-label="选择当前页"
                  checked={controller.pageSelectionState}
                  onCheckedChange={(value) =>
                    controller.togglePage(value === true)
                  }
                />
              </th>
              <th className="px-3 py-3">账号</th>
              <th className="px-3 py-3">类型 / 状态</th>
              <th className="px-3 py-3">额度</th>
              <th className="px-3 py-3">路由</th>
              <th className="px-3 py-3">凭据 / 来源</th>
              <th className="px-3 py-3">能力</th>
              <th className="px-3 py-3">时间</th>
              <th className="w-14 px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((account) => {
              const time = accountDisplayTime(account);
              return (
                <tr
                  key={account.id}
                  className="border-t border-border/70 transition-colors hover:bg-surface-hover/60"
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      aria-label={`选择 ${account.display_name || account.id}`}
                      checked={controller.selected.includes(account.id)}
                      onCheckedChange={(value) =>
                        controller.toggle(account.id, value === true)
                      }
                    />
                  </td>
                  <td className="max-w-72 px-3 py-3">
                    <GrokProviderAccountCell account={account} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="grid justify-items-start gap-1.5">
                      <GrokProviderTypeBadge account={account} />
                      <GrokProviderStatusBadge account={account} />
                    </div>
                  </td>
                  <td className="w-[22rem] px-3 py-3">
                    <GrokProviderQuota account={account} />
                  </td>
                  <td className="px-3 py-3">
                    <RouteCell account={account} />
                  </td>
                  <td className="max-w-44 px-3 py-3">
                    <GrokProviderCredential account={account} />
                  </td>
                  <td className="px-3 py-3">
                    <CapabilityCell account={account} />
                  </td>
                  <td className="px-3 py-3">
                    <GrokProviderTime {...time} />
                  </td>
                  <td className="px-3 py-3">
                    <GrokProviderRowActions account={account} {...props} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-3 md:hidden">
        {items.map((account) => (
          <MobileAccountCard key={account.id} account={account} props={props} />
        ))}
      </div>
      {controller.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/75 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>共 {controller.data.total} 个</span>
            <Select
              value={String(controller.pageSize)}
              onValueChange={(value) => controller.setPageSize(Number(value))}
            >
              <SelectTrigger
                size="sm"
                aria-label="每页显示数量"
                className="w-24 rounded-lg"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 / 页</SelectItem>
                <SelectItem value="50">50 / 页</SelectItem>
                <SelectItem value="100">100 / 页</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground tabular-nums">
              第 {controller.page} / {controller.pageCount} 页
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={controller.page <= 1 || controller.loading}
              onClick={() => controller.setPage(Math.max(1, controller.page - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                controller.page >= controller.pageCount || controller.loading
              }
              onClick={() => controller.setPage(controller.page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
