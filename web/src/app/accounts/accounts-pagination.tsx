import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AccountsPaginationProps = {
  filteredCount: number;
  startIndex: number;
  pageSize: string;
  safePage: number;
  pageCount: number;
  paginationItems: (number | "...")[];
  onPageSizeChange: (value: string) => void;
  onPageChange: (value: number | ((prev: number) => number)) => void;
};

export function AccountsPagination({ filteredCount, startIndex, pageSize, safePage, pageCount, paginationItems, onPageSizeChange, onPageChange }: AccountsPaginationProps) {
  return (
    <div className="border-t border-border/70 px-4 py-3">
      <div className="flex items-center justify-center gap-2.5 overflow-x-auto whitespace-nowrap">
        <div className="shrink-0 text-xs text-muted-foreground tabular-nums">显示第 {filteredCount === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + Number(pageSize), filteredCount)} 条，共 {filteredCount} 条</div>
        <span className="shrink-0 text-xs leading-none text-muted-foreground tabular-nums">{safePage} / {pageCount} 页</span>
        <Select value={pageSize} onValueChange={(value) => { onPageSizeChange(value); onPageChange(1); }}>
          <SelectTrigger className="h-9 w-[104px] shrink-0 rounded-lg border-border bg-background text-xs leading-none"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="10">10 / 页</SelectItem><SelectItem value="20">20 / 页</SelectItem><SelectItem value="50">50 / 页</SelectItem><SelectItem value="100">100 / 页</SelectItem></SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="size-9 shrink-0 rounded-lg border-border bg-background" disabled={safePage <= 1} onClick={() => onPageChange((prev) => Math.max(1, prev - 1))}><ChevronLeft className="size-4" /></Button>
        {paginationItems.map((item, index) => item === "..." ? <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted-foreground">...</span> : <PageButton key={item} item={item} safePage={safePage} onPageChange={onPageChange} />)}
        <Button variant="outline" size="icon" className="size-9 shrink-0 rounded-lg border-border bg-background" disabled={safePage >= pageCount} onClick={() => onPageChange((prev) => Math.min(pageCount, prev + 1))}><ChevronRight className="size-4" /></Button>
      </div>
    </div>
  );
}

function PageButton({ item, safePage, onPageChange }: { item: number; safePage: number; onPageChange: (value: number) => void }) {
  return (
    <Button variant={item === safePage ? "default" : "outline"} className={cn("h-9 min-w-9 shrink-0 rounded-lg px-2.5 text-xs tabular-nums", item === safePage ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-border bg-background text-foreground")} onClick={() => onPageChange(item)}>{item}</Button>
  );
}
