import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ADMIN_TABLE_PAGE_SIZE_OPTIONS, getTotalPages, type AdminTablePageSize } from "@/app/credits-admin/credits-admin-utils";

type CreditsTablePaginationProps = {
  label: string;
  total: number;
  page: number;
  pageSize: AdminTablePageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: AdminTablePageSize) => void;
};

export function CreditsTablePagination({ label, total, page, pageSize, onPageChange, onPageSizeChange }: CreditsTablePaginationProps) {
  const totalPages = getTotalPages(total, pageSize);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>{`每页 ${pageSize} 条，${label}共 ${total} 条；第 ${currentPage} / ${totalPages} 页`}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) as AdminTablePageSize)}>
          <SelectTrigger aria-label={`${label}每页条数`} className="h-8 w-[92px] rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>{ADMIN_TABLE_PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{`${size} 条`}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>上一页</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}>下一页</Button>
      </div>
    </div>
  );
}
