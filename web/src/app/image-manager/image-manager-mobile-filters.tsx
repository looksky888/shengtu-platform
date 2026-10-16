import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

import { ImageManagerFilterSelects } from "@/app/image-manager/image-manager-filter-selects";
import type {
  AutoRefreshMenuScope,
  ImageAspectRatioFilter,
  ImageAutoRefreshInterval,
  ImageFormatFilter,
  ImageOrientationFilter,
  ImageResolutionFilter,
  ImageVisibilityFilter,
} from "@/app/image-manager/image-manager-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ImageManagerMobileFiltersProps = {
  isMobileFiltersOpen: boolean;
  activeFilterLabels: string[];
  activeFilterCount: number;
  hasActiveFilters: boolean;
  visibilityFilter: ImageVisibilityFilter;
  formatFilter: ImageFormatFilter;
  orientationFilter: ImageOrientationFilter;
  resolutionFilter: ImageResolutionFilter;
  aspectRatioFilter: ImageAspectRatioFilter;
  onMobileFiltersOpenChange: (open: boolean) => void;
  onClearFilters: () => void;
  onVisibilityFilterChange: (value: ImageVisibilityFilter) => void;
  onFormatFilterChange: (value: ImageFormatFilter) => void;
  onOrientationFilterChange: (value: ImageOrientationFilter) => void;
  onResolutionFilterChange: (value: ImageResolutionFilter) => void;
  onAspectRatioFilterChange: (value: ImageAspectRatioFilter) => void;
  renderSearchFilter: (placeholder?: string) => ReactNode;
  renderDateRangeFilter: (className?: string) => ReactNode;
  renderAutoRefreshControls: (scope: AutoRefreshMenuScope, className?: string) => ReactNode;
  autoRefreshInterval?: ImageAutoRefreshInterval;
};

export function ImageManagerMobileFilters({
  isMobileFiltersOpen,
  activeFilterLabels,
  activeFilterCount,
  hasActiveFilters,
  onMobileFiltersOpenChange,
  onClearFilters,
  renderSearchFilter,
  renderDateRangeFilter,
  renderAutoRefreshControls,
  ...selectProps
}: ImageManagerMobileFiltersProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{renderSearchFilter("搜索图片")}</div>
        <button
          type="button"
          className={cn(
            "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-accent-foreground",
            isMobileFiltersOpen && "border-[#bfdbfe] bg-[#eef4ff] text-[#1456f0] dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300",
          )}
          onClick={() => onMobileFiltersOpenChange(!isMobileFiltersOpen)}
          aria-label={isMobileFiltersOpen ? "收起筛选项" : "展开筛选项"}
          aria-expanded={isMobileFiltersOpen}
          title={isMobileFiltersOpen ? "收起筛选" : "筛选"}
        >
          <SlidersHorizontal className="size-4" />
          {activeFilterCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-[#1456f0] text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>
      {activeFilterLabels.length > 0 && !isMobileFiltersOpen ? (
        <div className="hide-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
          {activeFilterLabels.map((label) => (
            <span key={label} className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {label}
            </span>
          ))}
          <button type="button" className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#1456f0]" onClick={onClearFilters}>
            清除
          </button>
        </div>
      ) : null}
      {isMobileFiltersOpen ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="col-span-2">{renderDateRangeFilter("w-full sm:w-full")}</div>
          <ImageManagerFilterSelects {...selectProps} />
          <Button type="button" variant="outline" className="col-span-2 h-9 rounded-full text-xs shadow-none" onClick={onClearFilters} disabled={!hasActiveFilters}>
            重置筛选
          </Button>
        </div>
      ) : null}
      {renderAutoRefreshControls("mobile", "mt-2 flex min-w-0 items-center gap-2")}
    </>
  );
}
