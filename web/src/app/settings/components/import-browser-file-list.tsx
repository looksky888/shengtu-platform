import { Checkbox } from "@/components/ui/checkbox";
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
    <div className="rounded-lg border border-border/70">
      <div className="flex items-center justify-between border-b border-[#f2f3f5] px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => onToggleSelectAllFiltered(Boolean(checked))} />
          <span>{"筛选结果"} {filteredFiles.length} {"个"}</span>
        </div>
        <span>{"已选"} {selectedNames.length} {"个"}</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {pagedFiles.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {"没有匹配的远程账号"}
          </div>
        ) : (
          <div className="divide-y divide-[#f2f3f5]">
            {pagedFiles.map((item) => (
              <label key={item.name} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/60">
                <Checkbox checked={selectedNames.includes(item.name)} onCheckedChange={(checked) => onToggleFile(item.name, Boolean(checked))} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{item.email || item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.name}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
