"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  getSettingsDomainForTab,
  getSettingsDomainGroup,
  getSettingsTabMeta,
  searchSettingsCatalog,
  type SettingsSearchMatch,
  type SettingsTabKey,
} from "../settings-tab-types";

export function SettingsHeader({
  activeTab,
  dirtyModules = [],
  isRefreshing = false,
  onRefresh,
  onNavigateToMatch,
}: {
  activeTab: SettingsTabKey;
  dirtyModules?: string[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onNavigateToMatch?: (tab: SettingsTabKey, sectionId?: string) => void;
}) {
  const activeTabMeta = getSettingsTabMeta(activeTab);
  const activeDomain = getSettingsDomainGroup(getSettingsDomainForTab(activeTab));

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => searchSettingsCatalog(query, 10), [query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, searchOpen]);

  // Global `/` shortcut inside `/settings` when not typing in an input/textarea
  useEffect(() => {
    if (!onNavigateToMatch) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setSearchOpen(true);
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNavigateToMatch]);

  const handlePickMatch = (match: SettingsSearchMatch) => {
    setSearchOpen(false);
    setQuery("");
    onNavigateToMatch?.(match.tab, match.sectionId);
  };

  return (
    <PageHeader
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <span>系统设置</span>
          <ChevronRight className="size-3 opacity-60" />
          <span>{activeDomain.label}</span>
        </span>
      }
      title={activeTabMeta.label}
      description={activeTabMeta.description}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {dirtyModules.length > 0 ? (
            <div
              role="status"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-status-warning/30 bg-status-warning-soft px-3 text-xs font-medium text-status-warning"
            >
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="max-w-52 truncate">
                未保存：{dirtyModules.join("、")}
              </span>
            </div>
          ) : null}

          {onNavigateToMatch ? (
            <Popover
              open={searchOpen}
              onOpenChange={(open) => {
                setSearchOpen(open);
                if (open) {
                  window.requestAnimationFrame(() => {
                    searchInputRef.current?.focus();
                  });
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="搜索系统设置项"
                  className="inline-flex h-8 w-44 items-center justify-between gap-2 rounded-lg border border-border/80 bg-surface px-2.5 text-xs text-muted-foreground shadow-2xs transition-colors hover:border-border-strong hover:text-foreground sm:w-56"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                    <Search className="size-3.5 shrink-0" />
                    <span className="truncate">搜索设置项、路由、R2…</span>
                  </span>
                  <Kbd className="hidden shrink-0 text-[10px] sm:inline-flex">/</Kbd>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/85 bg-surface p-0 shadow-lg"
              >
                <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setHighlightedIndex((prev) =>
                          matches.length > 0 ? (prev + 1) % matches.length : 0,
                        );
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setHighlightedIndex((prev) =>
                          matches.length > 0
                            ? (prev - 1 + matches.length) % matches.length
                            : 0,
                        );
                      } else if (event.key === "Enter" && matches[highlightedIndex]) {
                        event.preventDefault();
                        handlePickMatch(matches[highlightedIndex]);
                      }
                    }}
                    placeholder="搜索设置模块或配置关键词（如 Grok、SMTP、R2、代理、备份）…"
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      aria-label="清空搜索"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="thin-scrollbar max-h-80 overflow-y-auto p-1.5">
                  {matches.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      未找到与「{query}」匹配的设置项
                    </div>
                  ) : (
                    matches.map((match, idx) => {
                      const highlighted = idx === highlightedIndex;
                      const isCurrentTab = match.tab === activeTab;
                      return (
                        <button
                          key={match.id}
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => handlePickMatch(match)}
                          className={cn(
                            "flex w-full items-start justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                            highlighted
                              ? "bg-surface-muted text-foreground"
                              : "text-foreground/85 hover:bg-surface-hover",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-semibold text-foreground">
                                {match.sectionLabel || match.tabLabel}
                              </span>
                              <span className="rounded bg-foreground/[0.06] px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">
                                {match.sectionLabel
                                  ? `${match.domainLabel} · ${match.tabLabel}`
                                  : match.domainLabel}
                              </span>
                              {isCurrentTab ? (
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  当前页
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                              {match.summary}
                            </p>
                          </div>
                          <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isRefreshing}
              onClick={onRefresh}
              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
            >
              <RefreshCw className="size-3.5" />
              <span>刷新当前页</span>
            </Button>
          ) : null}
        </div>
      }
    />
  );
}
