import { Edit3, Image as ImageIcon, LoaderCircle, Megaphone, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { SettingsEmptyState, settingsListItemClassName } from "./settings-ui";
import { formatAnnouncementDateTime } from "./announcements-utils";
import type { AnnouncementsCardState } from "./use-announcements-card";

export function AnnouncementsList({ state }: { state: AnnouncementsCardState }) {
  if (state.isLoading) {
    return <div className="flex items-center justify-center py-10"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;
  }
  if (state.items.length === 0) {
    return <SettingsEmptyState icon={Megaphone} title="暂无公告" description="添加后可选择在登录页、创作台或两个位置同时展示。" />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-[16px] border border-border/70 bg-muted/25 p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={state.query} onChange={(event) => state.setQuery(event.target.value)} placeholder="搜索公告标题或内容" className="h-10 bg-background pl-9" aria-label="搜索公告" />
        </div>
        <div className="flex shrink-0 gap-1 rounded-xl bg-background p-1 ring-1 ring-border/70">
          {(["all", "enabled", "disabled"] as const).map((filter) => (
            <Button key={filter} type="button" size="sm" variant={state.statusFilter === filter ? "secondary" : "ghost"} className="h-8 rounded-lg px-3 text-xs" onClick={() => state.setStatusFilter(filter)}>
              {filter === "all" ? "全部" : filter === "enabled" ? "已启用" : "已停用"}
            </Button>
          ))}
        </div>
      </div>
      {state.visibleItems.length === 0 ? <SettingsEmptyState icon={Search} title="没有匹配的公告" description="调整搜索词或筛选条件后再试。" /> : null}
      {state.visibleItems.map((item) => {
        const isPending = state.pendingIds.has(item.id);
        return (
          <div key={item.id} className={`flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between ${settingsListItemClassName}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-semibold text-foreground">{item.title || "公告"}</div>
                <Badge variant={item.enabled ? "success" : "secondary"}>{item.enabled ? "已启用" : "已停用"}</Badge>
                {item.show_login ? <Badge variant="warning">登录页</Badge> : null}
                {item.show_image ? <Badge variant="info">创作台</Badge> : null}
              </div>
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.content}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground/80">
                <span>更新于 {formatAnnouncementDateTime(item.updated_at)}</span>
                {item.image_url ? <span className="inline-flex items-center gap-1"><ImageIcon className="size-3.5" />含配图</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void state.handleToggleEnabled(item)} disabled={isPending}>
                {isPending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}{item.enabled ? "停用" : "启用"}
              </Button>
              <Button type="button" variant="outline" onClick={() => state.openEditDialog(item)} disabled={isPending}><Edit3 data-icon="inline-start" />编辑</Button>
              <Button type="button" variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => state.setDeletingItem(item)} disabled={isPending}>
                <Trash2 data-icon="inline-start" />删除
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
