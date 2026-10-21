import {
  IMAGE_ASPECT_RATIO_FILTERS,
  IMAGE_RESOLUTION_FILTERS,
  type ImageAspectRatioFilter,
  type ImageFormatFilter,
  type ImageOrientationFilter,
  type ImageResolutionFilter,
  type ImageVisibilityFilter,
} from "@/app/image-manager/image-manager-types";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ImageManagerFilterSelectsProps = {
  visibilityFilter: ImageVisibilityFilter;
  formatFilter: ImageFormatFilter;
  orientationFilter: ImageOrientationFilter;
  resolutionFilter: ImageResolutionFilter;
  aspectRatioFilter: ImageAspectRatioFilter;
  onVisibilityFilterChange: (value: ImageVisibilityFilter) => void;
  onFormatFilterChange: (value: ImageFormatFilter) => void;
  onOrientationFilterChange: (value: ImageOrientationFilter) => void;
  onResolutionFilterChange: (value: ImageResolutionFilter) => void;
  onAspectRatioFilterChange: (value: ImageAspectRatioFilter) => void;
};

export function ImageManagerFilterSelects({
  visibilityFilter,
  formatFilter,
  orientationFilter,
  resolutionFilter,
  aspectRatioFilter,
  onVisibilityFilterChange,
  onFormatFilterChange,
  onOrientationFilterChange,
  onResolutionFilterChange,
  onAspectRatioFilterChange,
}: ImageManagerFilterSelectsProps) {
  return (
    <>
      <Select value={visibilityFilter} onValueChange={(value) => onVisibilityFilterChange(value as ImageVisibilityFilter)}>
        <SelectTrigger aria-label="图片公开状态筛选" className="h-9 min-w-0 rounded-lg text-xs md:w-[116px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="public">已公开</SelectItem>
            <SelectItem value="private">私有</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={formatFilter} onValueChange={(value) => onFormatFilterChange(value as ImageFormatFilter)}>
        <SelectTrigger aria-label="图片格式筛选" className="h-9 min-w-0 rounded-lg text-xs md:w-[116px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部格式</SelectItem>
            <SelectItem value="png">PNG</SelectItem>
            <SelectItem value="jpg">JPG</SelectItem>
            <SelectItem value="webp">WEBP</SelectItem>
            <SelectItem value="gif">GIF</SelectItem>
            <SelectItem value="other">其他</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={orientationFilter} onValueChange={(value) => onOrientationFilterChange(value as ImageOrientationFilter)}>
        <SelectTrigger aria-label="图片方向筛选" className="h-9 min-w-0 rounded-lg text-xs md:w-[116px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部方向</SelectItem>
            <SelectItem value="landscape">横图</SelectItem>
            <SelectItem value="portrait">竖图</SelectItem>
            <SelectItem value="square">方图</SelectItem>
            <SelectItem value="unknown">未知尺寸</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={resolutionFilter} onValueChange={(value) => onResolutionFilterChange(value as ImageResolutionFilter)}>
        <SelectTrigger aria-label="图片分辨率筛选" className="h-9 min-w-0 rounded-lg text-xs md:w-[120px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {IMAGE_RESOLUTION_FILTERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={aspectRatioFilter} onValueChange={(value) => onAspectRatioFilterChange(value as ImageAspectRatioFilter)}>
        <SelectTrigger aria-label="图片比例筛选" className="h-9 min-w-0 rounded-lg text-xs md:w-[116px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {IMAGE_ASPECT_RATIO_FILTERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
