import { RotateCcw, Search, X } from "lucide-react";

import { ImageManagerAutoRefreshControls } from "@/app/image-manager/image-manager-auto-refresh-controls";
import { ImageManagerFilterSelects } from "@/app/image-manager/image-manager-filter-selects";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImageGalleryView } from "@/lib/image-manager-cache";

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
  const renderSearchFilter = (placeholder = "搜索文件名、路径、作者…", className = "w-full md:w-64") => (
    <div className={`relative min-w-0 ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="搜索图片"
        value={props.searchKeyword}
        onChange={(event) => props.onSearchKeywordChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 rounded-lg pr-8 pl-8 text-xs"
      />
      {props.searchKeyword ? (
        <button
          type="button"
          className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={() => props.onSearchKeywordChange("")}
          aria-label="清空搜索"
          title="清空搜索"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  const renderDateRangeFilter = (className = "w-full sm:w-[210px]") => (
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

  return (
    <section className="rounded-[14px] border border-border/80 bg-surface p-3 shadow-2xs">
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
          renderSearchFilter={(placeholder) => renderSearchFilter(placeholder, "w-full")}
          renderDateRangeFilter={renderDateRangeFilter}
          renderAutoRefreshControls={renderAutoRefreshControls}
          autoRefreshInterval={props.autoRefreshInterval}
        />
      </div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {renderSearchFilter()}
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
        {renderDateRangeFilter("w-[210px]")}
        {props.hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={props.onClearFilters}
          >
            <RotateCcw className="size-3.5" />
            重置筛选
          </Button>
        ) : null}
      </div>
    </section>
  );
}
