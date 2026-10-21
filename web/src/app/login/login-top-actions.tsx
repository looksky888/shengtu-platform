import { Home, MoonStar, Sun } from "lucide-react";
import { Link } from "react-router-dom";

import type { LoginPageState } from "@/app/login/use-login-page";
import { AnnouncementNotifications } from "@/components/announcement-banner";
import { Button } from "@/components/ui/button";

export function LoginTopActions({ state }: { state: LoginPageState }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2 sm:right-6 sm:top-6" role="toolbar" aria-label="页面操作">
      <Button
        asChild
        type="button"
        variant="outline"
        size="icon"
        className="size-9 rounded-lg border-slate-200/80 bg-white/85 shadow-2xs backdrop-blur hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-slate-900/75 dark:hover:border-white/20 dark:hover:bg-slate-900"
        aria-label="返回品牌首页"
        title="返回首页"
      >
        <Link to="/">
          <Home className="size-4" aria-hidden="true" />
          <span className="sr-only">返回首页</span>
        </Link>
      </Button>
      <AnnouncementNotifications target="login" className="size-9" />
      <Button
        ref={state.themeToggleRef}
        type="button"
        variant="outline"
        size="icon"
        className="relative size-9 rounded-lg border-slate-200/80 bg-white/85 shadow-2xs backdrop-blur hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-slate-900/75 dark:hover:border-white/20 dark:hover:bg-slate-900"
        onClick={state.handleThemeToggle}
        aria-label={state.theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
        title={state.theme === "dark" ? "浅色模式" : "深色模式"}
      >
        <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden="true" />
        <MoonStar className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden="true" />
        <span className="sr-only">切换界面主题</span>
      </Button>
    </div>
  );
}
