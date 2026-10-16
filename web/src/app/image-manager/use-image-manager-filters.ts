import { useMemo, useState } from "react";

import type {
  ImageAspectRatioFilter,
  ImageFormatFilter,
  ImageOrientationFilter,
  ImageResolutionFilter,
  ImageVisibilityFilter,
} from "@/app/image-manager/image-manager-types";
import {
  getManagedImageAspectRatioFilter,
  getManagedImageFormat,
  getManagedImageOrientation,
  getManagedImageResolutionFilter,
  imageAspectRatioFilterLabel,
  imageFormatFilterLabel,
  imageOrientationFilterLabel,
  imageResolutionFilterLabel,
  imageVisibilityFilterLabel,
  matchesManagedImageKeyword,
} from "@/app/image-manager/image-manager-utils";
import type { ManagedImage } from "@/lib/api";
import type { ImageGalleryView } from "@/lib/image-manager-cache";

export function useImageManagerFilters(items: ManagedImage[], initialGalleryView: ImageGalleryView = "mine") {
  const [galleryView, setGalleryView] = useState<ImageGalleryView>(initialGalleryView);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<ImageVisibilityFilter>("all");
  const [formatFilter, setFormatFilter] = useState<ImageFormatFilter>("all");
  const [orientationFilter, setOrientationFilter] = useState<ImageOrientationFilter>("all");
  const [resolutionFilter, setResolutionFilter] = useState<ImageResolutionFilter>("all");
  const [aspectRatioFilter, setAspectRatioFilter] = useState<ImageAspectRatioFilter>("all");

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesManagedImageKeyword(item, searchKeyword)) return false;
        if (visibilityFilter !== "all" && item.visibility !== visibilityFilter) return false;
        if (formatFilter !== "all" && getManagedImageFormat(item) !== formatFilter) return false;
        if (orientationFilter !== "all" && getManagedImageOrientation(item) !== orientationFilter) return false;
        if (resolutionFilter !== "all" && getManagedImageResolutionFilter(item) !== resolutionFilter) return false;
        if (aspectRatioFilter !== "all" && getManagedImageAspectRatioFilter(item) !== aspectRatioFilter) return false;
        return true;
      }),
    [aspectRatioFilter, formatFilter, items, orientationFilter, resolutionFilter, searchKeyword, visibilityFilter],
  );

  const hasLocalFilters =
    searchKeyword.trim() !== "" ||
    visibilityFilter !== "all" ||
    formatFilter !== "all" ||
    orientationFilter !== "all" ||
    resolutionFilter !== "all" ||
    aspectRatioFilter !== "all";
  const hasActiveFilters = hasLocalFilters || startDate !== "" || endDate !== "";
  const activeFilterLabels = [
    startDate && endDate ? `${startDate} 至 ${endDate}` : startDate ? startDate : "",
    visibilityFilter !== "all" ? imageVisibilityFilterLabel(visibilityFilter) : "",
    formatFilter !== "all" ? imageFormatFilterLabel(formatFilter) : "",
    orientationFilter !== "all" ? imageOrientationFilterLabel(orientationFilter) : "",
    resolutionFilter !== "all" ? imageResolutionFilterLabel(resolutionFilter) : "",
    aspectRatioFilter !== "all" ? imageAspectRatioFilterLabel(aspectRatioFilter) : "",
  ].filter(Boolean);

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearchKeyword("");
    setVisibilityFilter("all");
    setFormatFilter("all");
    setOrientationFilter("all");
    setResolutionFilter("all");
    setAspectRatioFilter("all");
  };

  return {
    galleryView,
    startDate,
    endDate,
    searchKeyword,
    visibilityFilter,
    formatFilter,
    orientationFilter,
    resolutionFilter,
    aspectRatioFilter,
    filteredItems,
    hasLocalFilters,
    hasActiveFilters,
    activeFilterLabels,
    activeFilterCount: activeFilterLabels.length,
    setGalleryView,
    setStartDate,
    setEndDate,
    setSearchKeyword,
    setVisibilityFilter,
    setFormatFilter,
    setOrientationFilter,
    setResolutionFilter,
    setAspectRatioFilter,
    clearFilters,
  };
}