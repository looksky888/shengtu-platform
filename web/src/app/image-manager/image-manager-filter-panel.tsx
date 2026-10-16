import type { CSSProperties } from "react";
import { Search, X } from "lucide-react";

import { ImageManagerAutoRefreshControls } from "@/app/image-manager/image-manager-auto-refresh-controls";
import { ImageManagerFilterSelects } from "@/app/image-manager/image-manager-filter-selects";
import { ImageManagerGalleryViewTabs } from "@/app/image-manager/image-manager-gallery-view-tabs";
import { ImageManagerMobileFilters } from "@/app/image-manager/image-manager-mobile-filters";
import {
  type AutoRefreshMenuScope,
  type ImageAspectRatioFilter,
  type ImageAutoRefreshInterval,
  type ImageFormatFilter,
  type ImageOrientationFilter,
  type ImageResolutionFilter,
  type ImageVisibilityFilter,
} from "@/app/image-manager/image-manager-types";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Input } from "@/components/ui/input";
import type { ImageGalleryView } from "@/lib/image-manager-cache";
import { cn } from "@/lib/utils";

type ImageManagerFilterPanelProps = {
  galleryView: ImageGalleryView;
  isAdmin: boolean;
  itemsCount: number;
  filteredCount: number;
  hasLocalFilters: boolean;
  serverTotal?: number;
  serverHasMore?: boolean;
  currentPage?: number;
  hasActiveFilters: boolean;
  activeFilterLabels: string[];
  activeFilterCount: number;
  isMobileFiltersOpen: boolean;
  startDate: string;
  endDate: string;
  searchKeyword: string;
  visibilityFilter: ImageVisibilityFilter;
  formatFilter: ImageFormatFilter;
  orientationFilter: ImageOrientationFilter;
  resolutionFilter: ImageResolutionFilter;
  aspectRatioFilter: ImageAspectRatioFilter;
  autoRefreshMenuScope: AutoRefreshMenuScope | null;
  autoRefreshButtonLabel: string;
  isAutoRefreshing: boolean;
  isAutoRefreshEnabled: boolean;
  autoRefreshInterval: ImageAutoRefreshInterval;
  isLoading: boolean;
  isMutatingImages: boolean;
  onGalleryViewChange: (view: ImageGalleryView) => void;
  onDateRangeChange: (start: string, end: string) => void;
  onSearchKeywordChange: (value: string) => void;
  onVisibilityFilterChange: (value: ImageVisibilityFilter) => void;
  onFormatFilterChange: (value: ImageFormatFilter) => void;
  onOrientationFilterChange: (value: ImageOrientationFilter) => void;
  onResolutionFilterChange: (value: ImageResolutionFilter) => void;
  onAspectRatioFilterChange: (value: ImageAspectRatioFilter) => void;
  onClearFilters: () => void;
  onMobileFiltersOpenChange: (open: boolean) => void;
  onAutoRefreshScopeChange: (scope: AutoRefreshMenuScope | null) => void;
  onToggleAutoRefresh: () => void;
  onAutoRefreshIntervalChange: (interval: ImageAutoRefreshInterval) => void;
  onRefresh: () => void;
};

export function ImageManagerFilterPanel(props: ImageManagerFilterPanelProps) {
  const renderSearchFilter = (placeholder = "搜索文件、路径、作者、日期、尺寸") => (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="搜索图片"
        value={props.searchKeyword}
        onChange={(event) => props.onSearchKeywordChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg pr-9 pl-9"
      />
      {props.searchKeyword ? (
        <button
          type="button"
          className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={() => props.onSearchKeywordChange("")}
          aria-label="清空搜索"
          title="清空搜索"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  const renderDateRangeFilter = (className = "w-full sm:w-full") => (
    <DateRangeFilter
      className={className}
      startDate={props.startDate}
      endDate={props.endDate}
      onChange={props.onDateRangeChange}
    />
  );

  const renderAutoRefreshControls = (scope: AutoRefreshMenuScope, className?: string) => (
    <ImageManagerAutoRefreshControls
      menuScope={scope}
      className={className}
      activeScope={props.autoRefreshMenuScope}
      buttonLabel={props.autoRefreshButtonLabel}
      isAutoRefreshing={props.isAutoRefreshing}
      isAutoRefreshEnabled={props.isAutoRefreshEnabled}
      autoRefreshInterval={props.autoRefreshInterval}
      isLoading={props.isLoading}
      isMutatingImages={props.isMutatingImages}
      onScopeChange={props.onAutoRefreshScopeChange}
      onToggleAutoRefresh={props.onToggleAutoRefresh}
      onIntervalChange={props.onAutoRefreshIntervalChange}
      onRefresh={props.onRefresh}
    />
  );

  // Keep the view switcher wide enough for all tabs; the tab buttons also shrink safely.
  const railStyle = {
    ["--gallery-rail-min" as string]: props.isAdmin ? "24rem" : "17rem",
    ["--gallery-rail-max" as string]: props.isAdmin ? "27rem" : "20rem",
  } as CSSProperties;

  return (
    <section
      className={cn(
        "grid gap-4 rounded-[18px] border border-border bg-background/80 p-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)] sm:p-4 xl:items-start",
        "xl:[grid-template-columns:minmax(var(--gallery-rail-min),var(--gallery-rail-max))_minmax(0,1fr)]",
      )}
      style={railStyle}
    >
      <ImageManagerGalleryViewTabs
        galleryView={props.galleryView}
        isAdmin={props.isAdmin}
        itemsCount={props.itemsCount}
        filteredCount={props.filteredCount}
        hasLocalFilters={props.hasLocalFilters}
        serverTotal={props.serverTotal}
        serverHasMore={props.serverHasMore}
        currentPage={props.currentPage}
        onGalleryViewChange={props.onGalleryViewChange}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <FilterHeader hasActiveFilters={props.hasActiveFilters} onClearFilters={props.onClearFilters} />
        <div className="md:hidden">
          <ImageManagerMobileFilters
            isMobileFiltersOpen={props.isMobileFiltersOpen}
            activeFilterLabels={props.activeFilterLabels}
            activeFilterCount={props.activeFilterCount}
            hasActiveFilters={props.hasActiveFilters}
            visibilityFilter={props.visibilityFilter}
            formatFilter={props.formatFilter}
            orientationFilter={props.orientationFilter}
            resolutionFilter={props.resolutionFilter}
            aspectRatioFilter={props.aspectRatioFilter}
            onMobileFiltersOpenChange={props.onMobileFiltersOpenChange}
            onClearFilters={props.onClearFilters}
            onVisibilityFilterChange={props.onVisibilityFilterChange}
            onFormatFilterChange={props.onFormatFilterChange}
            onOrientationFilterChange={props.onOrientationFilterChange}
            onResolutionFilterChange={props.onResolutionFilterChange}
            onAspectRatioFilterChange={props.onAspectRatioFilterChange}
            renderSearchFilter={renderSearchFilter}
            renderDateRangeFilter={renderDateRangeFilter}
            renderAutoRefreshControls={renderAutoRefreshControls}
            autoRefreshInterval={props.autoRefreshInterval}
          />
        </div>
        <div className="hidden flex-col gap-2 md:flex">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {renderDateRangeFilter("w-full sm:w-full")}
            {renderSearchFilter()}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
            <ImageManagerFilterSelects
              visibilityFilter={props.visibilityFilter}
              formatFilter={props.formatFilter}
              orientationFilter={props.orientationFilter}
              resolutionFilter={props.resolutionFilter}
              aspectRatioFilter={props.aspectRatioFilter}
              onVisibilityFilterChange={props.onVisibilityFilterChange}
              onFormatFilterChange={props.onFormatFilterChange}
              onOrientationFilterChange={props.onOrientationFilterChange}
              onResolutionFilterChange={props.onResolutionFilterChange}
              onAspectRatioFilterChange={props.onAspectRatioFilterChange}
            />
            {renderAutoRefreshControls("desktop", "col-span-2 flex min-w-0 items-center gap-2")}
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterHeader({ hasActiveFilters, onClearFilters }: Pick<ImageManagerFilterPanelProps, "hasActiveFilters" | "onClearFilters">) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm font-medium text-foreground">筛选项</div>
      {hasActiveFilters ? (
        <button type="button" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={onClearFilters}>
          <X className="size-3.5" />
          清空
        </button>
      ) : null}
    </div>
  );
}
