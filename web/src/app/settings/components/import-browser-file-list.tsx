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
    <div className="rounded-[16px] border border-border/80">
      <div className="flex items-center justify-between border-b border-[#f2f3f5] px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => onToggleSelectAllFiltered(Boolean(checked))} />
          <span>{"\u7b5b\u9009\u7ed3\u679c"} {filteredFiles.length} {"\u4e2a"}</span>
        </div>
        <span>{"\u5df2\u9009"} {selectedNames.length} {"\u4e2a"}</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {pagedFiles.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {"\u6ca1\u6709\u5339\u914d\u7684\u8fdc\u7a0b\u8d26\u53f7"}
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
