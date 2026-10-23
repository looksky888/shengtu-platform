import { Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import type { CPARemoteFile } from "@/lib/api";
import { cn } from "@/lib/utils";

type ImportBrowserFileListProps = {
  pagedFiles: CPARemoteFile[];
  selectedSet: ReadonlySet<string>;
  allPageSelected: boolean;
  somePageSelected: boolean;
  disabled?: boolean;
  onToggleSelectPage: (checked: boolean) => void;
  onToggleFile: (name: string, checked: boolean) => void;
};

export function ImportBrowserFileList({
  pagedFiles,
  selectedSet,
  allPageSelected,
  somePageSelected,
  disabled = false,
  onToggleSelectPage,
  onToggleFile,
}: ImportBrowserFileListProps) {
  const pageSelectedCount = pagedFiles.filter((item) =>
    selectedSet.has(item.name)
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/75 bg-surface">
      <div className="flex items-center justify-between border-b border-border/70 bg-surface-subtle/75 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-3 select-none text-foreground">
          <Checkbox
            aria-label="全选当前页账号"
            disabled={disabled || pagedFiles.length === 0}
            checked={
              allPageSelected
                ? true
                : somePageSelected
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) =>
              onToggleSelectPage(checked === true)
            }
          />
          <span className="tabular-nums">
            全选本页（{pageSelectedCount}/{pagedFiles.length}）
          </span>
        </label>
        <span className="font-mono text-[11px] text-muted-foreground">
          邮箱 / 凭证文件名
        </span>
      </div>

      <div className="thin-scrollbar max-h-[360px] flex-1 overflow-y-auto">
        {pagedFiles.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title="没有匹配的远程账号"
            description="请调整搜索关键词或清空筛选条件后重试。"
            className="py-10"
          />
        ) : (
          <div className="divide-y divide-border/60">
            {pagedFiles.map((item) => {
              const checked = selectedSet.has(item.name);
              return (
                <label
                  key={item.name}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover/60",
                    checked && "bg-surface-subtle/65",
                    disabled && "pointer-events-none opacity-60"
                  )}
                >
                  <Checkbox
                    disabled={disabled}
                    checked={checked}
                    onCheckedChange={(nextChecked) =>
                      onToggleFile(item.name, Boolean(nextChecked))
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="truncate text-xs font-medium text-foreground sm:text-sm">
                      {item.email || item.name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {item.name}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
