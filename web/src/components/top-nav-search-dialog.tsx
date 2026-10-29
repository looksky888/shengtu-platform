"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Coins,
  CornerDownLeft,
  Film,
  LogOut,
  MoonStar,
  PlusCircle,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  getNavItemIcon,
  isActivePath,
  navGroups,
  profileNavItem,
  type NavItem,
} from "@/components/top-nav-config";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

type CommandEntry = {
  id: string;
  groupLabel: string;
  label: string;
  subtitle?: string;
  badge?: string;
  icon: LucideIcon;
  keywords: string[];
  active?: boolean;
  onSelect: () => void;
};

const SETTINGS_SUB_COMMANDS: Array<{
  tab: string;
  label: string;
  subtitle: string;
  keywords: string[];
}> = [
  {
    tab: "base",
    label: "设置 · 基础设置",
    subtitle: "平台名称、站点地址、无限画布链接与默认限流",
    keywords: ["settings", "base", "canvas", "基础", "设置", "限流"],
  },
  {
    tab: "image",
    label: "设置 · 生图与视频设置",
    subtitle: "生图渠道、模型并发、队列容量与积分定价",
    keywords: ["settings", "image", "video", "price", "channel", "生图", "渠道", "定价", "积分"],
  },
  {
    tab: "storage",
    label: "设置 · 媒体存储",
    subtitle: "本地/S3/R2 对象存储与图片视频保留天数",
    keywords: ["settings", "storage", "s3", "r2", "存储", "清理"],
  },
  {
    tab: "email",
    label: "设置 · 邮箱与注册",
    subtitle: "注册开关、邮箱服务商与验证码超时配置",
    keywords: ["settings", "email", "mail", "邮箱", "注册"],
  },
  {
    tab: "register",
    label: "设置 · 代理与 FlareSolverr",
    subtitle: "出站代理池、Cloudflare 过盾与注册机参数",
    keywords: ["settings", "register", "proxy", "flaresolverr", "代理", "过盾"],
  },
  {
    tab: "imports",
    label: "设置 · 账号导入",
    subtitle: "CPA 远程号池连接与批量文件导入",
    keywords: ["settings", "import", "cpa", "pool", "导入", "号池"],
  },
  {
    tab: "announcement",
    label: "设置 · 站内公告",
    subtitle: "工作台顶部公告通知与弹窗发布管理",
    keywords: ["settings", "announcement", "notice", "公告", "通知"],
  },
  {
    tab: "backup",
    label: "设置 · 数据备份",
    subtitle: "系统数据库与配置快照备份恢复",
    keywords: ["settings", "backup", "restore", "备份", "恢复"],
  },
  {
    tab: "maintenance",
    label: "设置 · 维护与日志",
    subtitle: "日志保留策略、级别开关与账号自动清理",
    keywords: ["settings", "maintenance", "logs", "维护", "日志"],
  },
  {
    tab: "system-update",
    label: "设置 · 系统更新",
    subtitle: "在线检查 GitHub Release 新版本并联动 Host Updater 无缝升级",
    keywords: ["settings", "update", "version", "upgrade", "更新", "升级", "版本"],
  },
];

export type NavSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
  pathname: string;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onLogout?: () => Promise<void> | void;
};

export default function NavSearchDialog({
  open,
  onOpenChange,
  items,
  pathname,
  theme,
  onToggleTheme,
  onLogout,
}: NavSearchDialogProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();

  const canAccessSettings = useMemo(
    () => items.some((item) => item.href === "/settings"),
    [items]
  );
  const canAccessImage = useMemo(
    () => items.some((item) => item.href === "/image"),
    [items]
  );
  const canAccessVideo = useMemo(
    () => items.some((item) => item.href === "/video"),
    [items]
  );

  const allEntries = useMemo<CommandEntry[]>(() => {
    const entries: CommandEntry[] = [];
    const groupLabelMap = new Map(navGroups.map((g) => [g.id, g.label]));

    if (canAccessImage) {
      entries.push({
        id: "action:new-image-session",
        groupLabel: "快捷操作",
        label: "新建图片创作会话",
        subtitle: "打开图片工作台并开启一个全新空白创作画布",
        badge: "Action",
        icon: PlusCircle,
        keywords: ["new", "image", "create", "session", "新建", "生图", "创作", "会话"],
        onSelect: () => navigate("/image?new=1"),
      });
    }

    if (canAccessVideo) {
      entries.push({
        id: "action:open-video-studio",
        groupLabel: "快捷操作",
        label: "打开视频暗房工作台",
        subtitle: "文生视频、图生视频与连续镜头扩展生成",
        badge: "Studio",
        icon: Film,
        keywords: ["video", "cinema", "sora", "grok", "视频", "暗房", "成片"],
        onSelect: () => navigate("/video"),
      });
    }

    if (onToggleTheme) {
      entries.push({
        id: "action:toggle-theme",
        groupLabel: "快捷操作",
        label: theme === "dark" ? "切换到浅色画廊主题" : "切换到深色暗房主题",
        subtitle: "一键切换全站浅色纸境 / 深色曜石工作台配色",
        badge: "Theme",
        icon: theme === "dark" ? Sun : MoonStar,
        keywords: ["theme", "dark", "light", "主题", "深色", "浅色", "夜间", "暗黑"],
        onSelect: () => onToggleTheme(),
      });
    }

    entries.push({
      id: "nav:/profile?tab=api",
      groupLabel: "快捷操作",
      label: "生成或查看个人 API 密钥",
      subtitle: "管理个人 sk- 令牌、自检连通性并查阅 OpenAI / 视频接口文档",
      badge: "API Key",
      icon: BookOpen,
      keywords: [
        "api",
        "key",
        "token",
        "docs",
        "openai",
        "sdk",
        "接口",
        "密钥",
        "文档",
        "对接",
      ],
      onSelect: () => navigate("/profile?tab=api"),
    });

    entries.push({
      id: "nav:/profile?tab=credits",
      groupLabel: "快捷操作",
      label: "个人积分中心与每日签到",
      subtitle: "领取每日签到算力积分、查看消费与退费流水明细",
      badge: "Credits",
      icon: Coins,
      keywords: ["credits", "ledger", "balance", "checkin", "积分", "流水", "余额", "签到"],
      onSelect: () => navigate("/profile?tab=credits"),
    });

    if (canAccessSettings) {
      entries.push({
        id: "action:check-update",
        groupLabel: "快捷操作",
        label: "检查系统版本与在线升级",
        subtitle: "检测 GitHub 最新版本并通过 Host Updater 平滑热更新",
        badge: "Update",
        icon: RefreshCw,
        keywords: ["update", "upgrade", "version", "release", "更新", "升级", "版本"],
        onSelect: () => navigate("/settings?tab=system-update"),
      });
    }

    entries.push({
      id: "nav:/profile",
      groupLabel: "快捷操作",
      label: profileNavItem.label,
      subtitle: profileNavItem.description,
      badge: "/profile",
      icon: UserCircle2,
      keywords: ["profile", "account", "user", "个人中心", "账号", "密码", "邀请", "卡密"],
      active: isActivePath(pathname, "/profile"),
      onSelect: () => navigate("/profile"),
    });

    for (const item of items) {
      const groupName = groupLabelMap.get(item.group ?? "creation") ?? "页面导航";
      entries.push({
        id: `nav:${item.href}`,
        groupLabel: groupName,
        label: item.label,
        subtitle: item.description,
        badge: item.href,
        icon: getNavItemIcon(item),
        keywords: [
          item.label,
          item.href,
          item.description ?? "",
          ...(item.keywords ?? []),
        ],
        active: isActivePath(pathname, item.href),
        onSelect: () => {
          if (item.external) {
            window.open(item.href, "_blank", "noopener,noreferrer");
          } else {
            navigate(item.href);
          }
        },
      });
    }

    if (canAccessSettings) {
      for (const sub of SETTINGS_SUB_COMMANDS) {
        entries.push({
          id: `settings:${sub.tab}`,
          groupLabel: "设置直达",
          label: sub.label,
          subtitle: sub.subtitle,
          badge: `/settings?tab=${sub.tab}`,
          icon: Settings2,
          keywords: [sub.label, sub.subtitle, ...sub.keywords],
          onSelect: () => navigate(`/settings?tab=${sub.tab}`),
        });
      }
    }

    if (onLogout) {
      entries.push({
        id: "action:logout",
        groupLabel: "账号会话",
        label: "退出当前登录账号",
        subtitle: "安全注销本地登录凭据并返回门户首页",
        badge: "Sign out",
        icon: LogOut,
        keywords: ["logout", "signout", "exit", "退出", "注销", "登出"],
        onSelect: () => {
          void onLogout();
        },
      });
    }

    return entries;
  }, [
    canAccessImage,
    canAccessSettings,
    canAccessVideo,
    items,
    navigate,
    onLogout,
    onToggleTheme,
    pathname,
    theme,
  ]);

  const matches = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) {
      return allEntries;
    }
    return allEntries.filter((entry) =>
      entry.keywords.some((k) => k.toLocaleLowerCase().includes(keyword))
    );
  }, [allEntries, query]);

  const groupedMatches = useMemo(() => {
    const groups: Array<{ label: string; items: Array<{ entry: CommandEntry; flatIndex: number }> }> = [];
    const map = new Map<string, Array<{ entry: CommandEntry; flatIndex: number }>>();
    matches.forEach((entry, flatIndex) => {
      let bucket = map.get(entry.groupLabel);
      if (!bucket) {
        bucket = [];
        map.set(entry.groupLabel, bucket);
        groups.push({ label: entry.groupLabel, items: bucket });
      }
      bucket.push({ entry, flatIndex });
    });
    return groups;
  }, [matches]);

  const selectedIndex = matches.length
    ? Math.min(activeIndex, matches.length - 1)
    : -1;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    resultsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open, query]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (isImeComposing(event) || !matches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((selectedIndex + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((selectedIndex - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = matches[selectedIndex];
      if (target) {
        onOpenChange(false);
        target.onSelect();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(36rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-2xl border-border/85 bg-surface-raised p-0 shadow-2xl"
      >
        <DialogTitle className="sr-only">全局命令与页面导航</DialogTitle>
        <DialogDescription className="sr-only">
          输入关键字快速跳转到任意工作台页面、系统设置分栏或执行快捷命令
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-border/75 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={resultsId}
            aria-activedescendant={
              selectedIndex >= 0 ? `${resultsId}-${selectedIndex}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索功能页面、设置项或快捷操作…"
            className="h-6 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div
          ref={resultsRef}
          id={resultsId}
          role="listbox"
          aria-label="命令与页面搜索结果"
          className="thin-scrollbar max-h-[min(25rem,64dvh)] scroll-py-2 overflow-y-auto px-2.5 py-2.5"
        >
          {groupedMatches.length > 0 ? (
            <div className="space-y-3 pb-1">
              {groupedMatches.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground/80">
                    {group.label}
                  </div>
                  {group.items.map(({ entry, flatIndex }) => {
                    const Icon = entry.icon;
                    const isSelected = flatIndex === selectedIndex;
                    return (
                      <button
                        key={entry.id}
                        id={`${resultsId}-${flatIndex}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => {
                          onOpenChange(false);
                          entry.onSelect();
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                          isSelected
                            ? "bg-surface-muted text-foreground"
                            : "text-foreground hover:bg-surface-hover"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                              isSelected
                                ? "border-border bg-surface text-foreground shadow-2xs"
                                : entry.active
                                  ? "border-foreground/20 bg-foreground text-background"
                                  : "border-border/70 bg-surface-muted text-muted-foreground"
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {entry.label}
                              </span>
                              {entry.active ? (
                                <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                                  当前
                                </span>
                              ) : null}
                            </div>
                            {entry.subtitle ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {entry.subtitle}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {entry.badge ? (
                            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                              {entry.badge}
                            </span>
                          ) : null}
                          <ArrowRight
                            className={cn(
                              "size-3.5 transition-transform",
                              isSelected
                                ? "translate-x-0.5 text-foreground"
                                : "text-muted-foreground/40"
                            )}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              没有匹配的页面或命令，请尝试其他关键词
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/70 bg-surface-muted/50 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>选择</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>
                <CornerDownLeft className="size-3" />
              </Kbd>
              <span>打开</span>
            </span>
          </div>
          <span>全局快捷键 Ctrl / ⌘ + K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
