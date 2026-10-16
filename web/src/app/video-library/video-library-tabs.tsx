import { Film, Globe2, LayoutGrid } from "lucide-react";

import { MediaLibraryTabs } from "@/components/media-library-tabs";
import type { VideoLibraryScope } from "@/lib/video-task-api";

const labels: Record<VideoLibraryScope, string> = {
  all: "全部视频",
  mine: "个人视频",
  public: "公开视频",
};

export function VideoLibraryTabs({ scope, isAdmin, total, onChange }: {
  scope: VideoLibraryScope;
  isAdmin: boolean;
  total: number;
  onChange: (scope: VideoLibraryScope) => void;
}) {
  const options = [
    ...(isAdmin ? [{ value: "all" as const, icon: LayoutGrid }] : []),
    { value: "mine" as const, icon: Film },
    { value: "public" as const, icon: Globe2 },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <MediaLibraryTabs value={scope} label="视频库视图" options={options.map((option) => ({ ...option, label: labels[option.value] }))} onChange={onChange} />
      <p className="px-0.5 text-sm text-muted-foreground"><span className="font-medium text-foreground/80">{labels[scope]}</span> · 共 {total} 个</p>
    </div>
  );
}
