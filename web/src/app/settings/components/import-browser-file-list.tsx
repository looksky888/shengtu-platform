import { Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import type { CPARemoteFile } from "@/lib/api";

type ImportBrowserFileListProps = {
  filteredFiles: CPARemoteFile[];
  pagedFiles: CPARemoteFile[];
  selectedNames: string[];
  allFilteredSelected: boolean;
  onToggleSelectAllFiltered: (checked: boolean) => void;
  onToggleFile: (name: string, checked: boolean) => void;
};

export function ImportBrowserFileList({
  filteredFiles,
  pagedFiles,
  selectedNames,
  allFilteredSelected,
  onToggleSelectAllFiltered,
  onToggleFile,
}: ImportBrowserFileListProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
      <div className="flex items-center justify-between border-b border-border/70 bg-surface-subtle/80 px-4 py-3 text-xs font-medium text-muted-foreground">
        <div className="flex items-center gap-3">
          <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => onToggleSelectAllFiltered(Boolean(checked))} />
          <span className="tabular-nums">筛选结果 {filteredFiles.length} 个</span>
        </div>
        <span className="tabular-nums">已选 {selectedNames.length} 个</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {pagedFiles.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title="没有匹配的远程账号"
            description="请调整搜索词或筛选条件后重试。"
            className="py-10"
          />
        ) : (
          <div className="divide-y divide-border/60">
            {pagedFiles.map((item) => (
              <label key={item.name} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover/60">
                <Checkbox checked={selectedNames.includes(item.name)} onCheckedChange={(checked) => onToggleFile(item.name, Boolean(checked))} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{item.email || item.name}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{item.name}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
