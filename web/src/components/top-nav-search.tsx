import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isActivePath, type NavItem } from "@/components/top-nav-config";
import { cn } from "@/lib/utils";

export function NavSearchMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const matches = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return keyword ? items.filter((item) => item.label.toLocaleLowerCase().includes(keyword) || item.href.toLocaleLowerCase().includes(keyword)) : items;
  }, [items, query]);
  const selectedIndex = matches.length ? Math.min(activeIndex, matches.length - 1) : -1;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    resultsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open, query]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || !matches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((selectedIndex + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((selectedIndex - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      resultsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.click();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="搜索页面" title="搜索页面（Ctrl/⌘ + K）"><Search className="size-4" /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] p-2" onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={open} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder="搜索功能页面" className="h-10 rounded-xl pl-9" aria-label="搜索功能页面" aria-controls={resultsId} aria-activedescendant={selectedIndex >= 0 ? `${resultsId}-${selectedIndex}` : undefined} />
        </div>
        <div ref={resultsRef} id={resultsId} className="mt-2 grid max-h-72 gap-1 overflow-y-auto" role="listbox" aria-label="页面搜索结果">
          {matches.length ? matches.map((item, index) => (
            <Link id={`${resultsId}-${index}`} role="option" tabIndex={-1} aria-selected={index === selectedIndex} key={item.href} to={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} reloadDocument={item.external} onMouseEnter={() => setActiveIndex(index)} onClick={() => setOpen(false)} className={cn("flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground", index === selectedIndex ? "bg-accent text-accent-foreground" : "", isActivePath(pathname, item.href) ? "bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300" : "text-foreground")}>
              <span className="shrink-0">{item.label}</span><span className="truncate font-mono text-[10px] text-muted-foreground" title={item.href}>{item.href}</span>
            </Link>
          )) : <div className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的页面</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
