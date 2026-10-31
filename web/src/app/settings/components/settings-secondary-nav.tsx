"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  ArrowUpRight,
  Check,
  ChevronDown,
  Database,
  FolderInput,
  Globe,
  Image,
  Mail,
  Megaphone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  getSettingsDomainForTab,
  getSettingsDomainGroup,
  getSettingsTabMeta,
  searchSettingsCatalog,
  SETTINGS_DOMAIN_GROUPS,
  SETTINGS_TABS,
  type SettingsSearchMatch,
  type SettingsTabKey,
} from "../settings-tab-types";

export const SETTINGS_TAB_ICON_MAP: Record<SettingsTabKey, LucideIcon> = {
  base: SlidersHorizontal,
  image: Image,
  storage: Database,
  email: Mail,
  register: Globe,
  imports: FolderInput,
  announcement: Megaphone,
  backup: ArchiveRestore,
  maintenance: Wrench,
  "system-update": RefreshCw,
};

const TAB_LABEL_MAP: Record<SettingsTabKey, string> = Object.fromEntries(
  SETTINGS_TABS.map((item) => [item.key, item.label]),
) as Record<SettingsTabKey, string>;

function SettingsQuickSearchPopover({
  activeTab,
  compactTrigger = false,
  open,
  onOpenChange,
  onNavigateToMatch,
}: {
  activeTab: SettingsTabKey;
  compactTrigger?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToMatch: (tab: SettingsTabKey, sectionId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => searchSettingsCatalog(query, 10), [query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
  }, [open]);

  const handlePick = (match: SettingsSearchMatch) => {
    onOpenChange(false);
    setQuery("");
    onNavigateToMatch(match.tab, match.sectionId);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {compactTrigger ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="搜索系统设置项"
            title="搜索设置项 (/)"
            className="size-8 shrink-0 rounded-lg"
          >
            <Search className="size-3.5" />
          </Button>
        ) : (
          <button
            type="button"
            aria-label="搜索系统设置项"
            className="flex h-8.5 w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface px-2.5 text-xs text-muted-foreground shadow-2xs transition-colors hover:border-border-strong hover:text-foreground"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
              <Search className="size-3.5 shrink-0" />
              <span className="truncate">搜索配置项…</span>
            </span>
            <Kbd className="shrink-0 text-[10px]">/</Kbd>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={compactTrigger ? "end" : "start"}
        sideOffset={8}
        className="w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/85 bg-surface p-0 shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
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
                handlePick(matches[highlightedIndex]);
              }
            }}
            placeholder="输入关键词直达（如 Grok、SMTP、R2、代理、公告、备份）…"
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
                  onClick={() => handlePick(match)}
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
  );
}

export function SettingsSecondaryNav({
  activeTab,
  activeSectionId,
  canManageSystem,
  dirtyTabSet,
  isRefreshing,
  onRefresh,
  onSelectTab,
  onSelectSection,
}: {
  activeTab: SettingsTabKey;
  activeSectionId: string;
  canManageSystem: boolean;
  dirtyTabSet: ReadonlySet<SettingsTabKey>;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectTab: (tab: SettingsTabKey, sectionId?: string) => void;
  onSelectSection: (sectionId: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeTabMeta = getSettingsTabMeta(activeTab);
  const activeDomain = getSettingsDomainGroup(getSettingsDomainForTab(activeTab));
  const ActiveTabIcon = SETTINGS_TAB_ICON_MAP[activeTab];
  const showSectionAnchors =
    canManageSystem && activeTabMeta.sections.length > 1;

  // Global `/` shortcut inside `/settings`
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
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
      if (window.matchMedia("(min-width: 768px)").matches) {
        setDesktopSearchOpen(true);
      } else {
        setMobileSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Mobile / Narrow (< md) Compact Single-Row Bar */}
      <div className="sticky top-14 z-30 space-y-1.5 rounded-2xl border border-border/80 bg-surface/92 p-2 shadow-2xs backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between gap-2">
          <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="切换系统设置分类"
                className="flex h-8.5 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface-subtle/75 px-3 text-left text-xs transition-colors hover:bg-surface-hover"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ActiveTabIcon className="size-3.5 shrink-0 text-foreground" />
                  <span className="truncate font-semibold text-foreground">
                    {activeTabMeta.label}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    · {activeDomain.label}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    mobileMenuOpen && "rotate-180",
                  )}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              className="w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-border/85 bg-surface p-2.5 shadow-xl"
            >
              {SETTINGS_DOMAIN_GROUPS.map((group) => (
                <div key={group.id} className="space-y-1">
                  <div className="px-2 text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground/80">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {group.tabs.map((tabKey) => {
                      const Icon = SETTINGS_TAB_ICON_MAP[tabKey];
                      const selected = tabKey === activeTab;
                      const dirty = dirtyTabSet.has(tabKey);
                      return (
                        <button
                          key={tabKey}
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            onSelectTab(tabKey);
                          }}
                          className={cn(
                            "flex h-8.5 items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors",
                            selected
                              ? "bg-surface-muted font-semibold text-foreground ring-1 ring-border/80"
                              : "font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            {TAB_LABEL_MAP[tabKey]}
                          </span>
                          {dirty ? (
                            <span className="size-1.5 shrink-0 rounded-full bg-status-warning" />
                          ) : selected ? (
                            <Check className="size-3 shrink-0 text-foreground" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </PopoverContent>
          </Popover>

          <div className="flex shrink-0 items-center gap-1">
            <SettingsQuickSearchPopover
              activeTab={activeTab}
              compactTrigger
              open={mobileSearchOpen}
              onOpenChange={setMobileSearchOpen}
              onNavigateToMatch={onSelectTab}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              loading={isRefreshing}
              onClick={onRefresh}
              aria-label="刷新当前页"
              title="刷新当前页"
              className="size-8 rounded-lg"
            >
              {!isRefreshing ? <RefreshCw className="size-3.5" /> : null}
            </Button>
          </div>
        </div>

        {showSectionAnchors ? (
          <div
            aria-label="当前设置页区块定位"
            className="hide-scrollbar flex items-center gap-1 overflow-x-auto pt-0.5"
          >
            {activeTabMeta.sections.map((section) => {
              const isSectionActive = activeSectionId === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSelectSection(section.id)}
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-[11px] transition-colors",
                    isSectionActive
                      ? "bg-foreground font-medium text-background"
                      : "bg-surface-subtle text-muted-foreground hover:text-foreground",
                  )}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Desktop (>= md) Sticky Grouped Vertical Secondary Rail */}
      <aside
        aria-label="系统设置分类导航"
        className="thin-scrollbar sticky top-18 hidden max-h-[calc(100dvh-5.5rem)] w-[204px] shrink-0 flex-col gap-3.5 overflow-y-auto rounded-2xl border border-border/80 bg-surface/80 p-2.5 shadow-2xs backdrop-blur-sm md:flex"
      >
        <SettingsQuickSearchPopover
          activeTab={activeTab}
          open={desktopSearchOpen}
          onOpenChange={setDesktopSearchOpen}
          onNavigateToMatch={onSelectTab}
        />

        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="系统设置模块导航"
          className="space-y-3.5"
        >
          {SETTINGS_DOMAIN_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1">
              <div className="px-2.5 text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted-foreground/75">
                {group.label}
              </div>

              <div className="space-y-0.5">
                {group.tabs.map((tabKey) => {
                  const Icon = SETTINGS_TAB_ICON_MAP[tabKey];
                  const active = tabKey === activeTab;
                  const isTabDirty = dirtyTabSet.has(tabKey);
                  const tabMeta = getSettingsTabMeta(tabKey);
                  const expandSections =
                    active && canManageSystem && tabMeta.sections.length > 1;

                  return (
                    <div key={tabKey}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-controls={`settings-panel-${tabKey}`}
                        onClick={() => onSelectTab(tabKey)}
                        className={cn(
                          "group relative isolate flex h-8.5 w-full items-center gap-2 rounded-xl px-2.5 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                          active
                            ? "font-semibold text-foreground"
                            : "font-medium text-muted-foreground hover:bg-surface-hover/70 hover:text-foreground",
                        )}
                      >
                        {active ? (
                          <motion.span
                            layoutId="settings-vertical-tab-pill"
                            transition={
                              prefersReducedMotion
                                ? { duration: 0.01 }
                                : {
                                    type: "spring",
                                    mass: 0.14,
                                    stiffness: 300,
                                    damping: 25,
                                  }
                            }
                            className="absolute inset-0 -z-10 rounded-xl bg-surface shadow-2xs ring-1 ring-border/85 dark:bg-surface-muted"
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "size-3.5 shrink-0 transition-colors",
                            active
                              ? "text-foreground"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {TAB_LABEL_MAP[tabKey]}
                        </span>
                        {isTabDirty ? (
                          <span
                            title="存在未保存修改"
                            aria-label="存在未保存修改"
                            className="size-1.5 shrink-0 rounded-full bg-status-warning"
                          />
                        ) : null}
                      </button>

                      {expandSections ? (
                        <div
                          aria-label={`${tabMeta.label}页内区块定位`}
                          className="mt-1 mb-1 ml-4 space-y-0.5 border-l border-border/75 pl-2.5"
                        >
                          {tabMeta.sections.map((section) => {
                            const sectionActive =
                              activeSectionId === section.id;
                            return (
                              <button
                                key={section.id}
                                type="button"
                                onClick={() => onSelectSection(section.id)}
                                className={cn(
                                  "relative flex h-6.5 w-full items-center rounded-lg px-2 text-left text-[11.5px] transition-colors",
                                  sectionActive
                                    ? "bg-surface-muted/85 font-semibold text-foreground"
                                    : "font-normal text-muted-foreground hover:bg-surface-hover/60 hover:text-foreground",
                                )}
                              >
                                {sectionActive ? (
                                  <span
                                    aria-hidden="true"
                                    className="absolute top-1.5 bottom-1.5 -left-[11px] w-0.5 rounded-full bg-foreground"
                                  />
                                ) : null}
                                <span className="truncate">{section.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
