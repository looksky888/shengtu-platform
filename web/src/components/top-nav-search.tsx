"use client";

import { Suspense, useEffect, useState } from "react";
import { Search } from "lucide-react";

import type { NavItem } from "@/components/top-nav-config";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { cn } from "@/lib/utils";

const LazyNavSearchDialog = lazyWithRetry(
  () => import("@/components/top-nav-search-dialog")
);

let searchDialogPreloaded = false;
function preloadSearchDialog() {
  if (searchDialogPreloaded) return;
  searchDialogPreloaded = true;
  void import("@/components/top-nav-search-dialog").catch(() => {
    searchDialogPreloaded = false;
  });
}

export function NavSearchMenu({
  items,
  pathname,
  theme,
  onToggleTheme,
  onLogout,
  compact = false,
}: {
  items: NavItem[];
  pathname: string;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onLogout?: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const openSearch = () => {
    setHasOpened(true);
    setOpen(true);
  };

  useEffect(() => {
    // Only one NavSearchMenu mounts at a time via TopNav viewport gating.
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        setHasOpened(true);
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon" : "sm"}
        onMouseEnter={preloadSearchDialog}
        onFocus={preloadSearchDialog}
        onClick={openSearch}
        aria-label="打开命令面板与页面搜索"
        title="搜索页面或命令（Ctrl/⌘ + K）"
        className={cn(
          "rounded-lg text-muted-foreground shadow-none hover:bg-surface-hover hover:text-foreground",
          compact
            ? "size-8"
            : "h-8 gap-2 bg-surface-muted/85 px-2.5 text-xs font-normal"
        )}
      >
        <Search className="size-3.5 shrink-0" />
        {compact ? null : (
          <>
            <span className="hidden xl:inline">搜索或跳转…</span>
            <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
          </>
        )}
      </Button>

      {hasOpened ? (
        <Suspense fallback={null}>
          <LazyNavSearchDialog
            open={open}
            onOpenChange={setOpen}
            items={items}
            pathname={pathname}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onLogout={onLogout}
          />
        </Suspense>
      ) : null}
    </>
  );
}
