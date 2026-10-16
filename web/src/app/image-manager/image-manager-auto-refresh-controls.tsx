import { Check, RefreshCw } from "lucide-react";

import {
  AUTO_REFRESH_INTERVAL_OPTIONS,
  type AutoRefreshMenuScope,
  type ImageAutoRefreshInterval,
} from "@/app/image-manager/image-manager-types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ImageManagerAutoRefreshControlsProps = {
  menuScope: AutoRefreshMenuScope;
  className?: string;
  activeScope: AutoRefreshMenuScope | null;
  buttonLabel: string;
  isAutoRefreshing: boolean;
  isAutoRefreshEnabled: boolean;
  autoRefreshInterval: ImageAutoRefreshInterval;
  isLoading: boolean;
  isMutatingImages: boolean;
  onScopeChange: (scope: AutoRefreshMenuScope | null) => void;
  onToggleAutoRefresh: () => void;
  onIntervalChange: (interval: ImageAutoRefreshInterval) => void;
  onRefresh: () => void;
};

export function ImageManagerAutoRefreshControls({
  menuScope,
  className = "flex min-w-0 items-center gap-2",
  activeScope,
  buttonLabel,
  isAutoRefreshing,
  isAutoRefreshEnabled,
  autoRefreshInterval,
  isLoading,
  isMutatingImages,
  onScopeChange,
  onToggleAutoRefresh,
  onIntervalChange,
  onRefresh,
}: ImageManagerAutoRefreshControlsProps) {
  return (
    <div className={className}>
      <Popover open={activeScope === menuScope} onOpenChange={(open) => onScopeChange(open ? menuScope : null)}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-0 flex-1 justify-start rounded-lg px-3 text-sm font-medium"
            aria-label={buttonLabel}
          >
            <RefreshCw className={cn("size-4", isAutoRefreshing && "animate-spin")} />
            <span className="truncate">{buttonLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[min(calc(100vw-2rem),17.5rem)] p-1">
          <div className="flex flex-col gap-1" role="menu">
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full justify-between rounded-md px-3 text-sm font-normal"
              onClick={onToggleAutoRefresh}
              role="menuitemcheckbox"
              aria-checked={isAutoRefreshEnabled}
            >
              <span>启用自动刷新</span>
              {isAutoRefreshEnabled ? (
                <Check className="size-4 text-[#21b8a6]" />
              ) : (
                <span className="size-4" aria-hidden="true" />
              )}
            </Button>
            {AUTO_REFRESH_INTERVAL_OPTIONS.map((interval) => {
              const selected = autoRefreshInterval === interval;
              return (
                <Button
                  key={interval}
                  type="button"
                  variant="ghost"
                  className="h-10 w-full justify-between rounded-md px-3 text-sm font-normal"
                  onClick={() => onIntervalChange(interval)}
                  role="menuitemradio"
                  aria-checked={selected}
                >
                  <span>{interval} 秒</span>
                  {selected ? (
                    <Check className="size-4 text-[#21b8a6]" />
                  ) : (
                    <span className="size-4" aria-hidden="true" />
                  )}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-10 rounded-lg"
        disabled={isLoading || isMutatingImages}
        onClick={onRefresh}
        aria-label="刷新图片库"
        title="刷新图片库"
      >
        <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
      </Button>
    </div>
  );
}
