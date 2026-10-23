import { Home, MoonStar, Sun } from "lucide-react";
import { Link } from "react-router-dom";

import type { LoginPageState } from "@/app/login/use-login-page";
import { AnnouncementNotifications } from "@/components/announcement-banner";
import { Button } from "@/components/ui/button";

export function LoginTopActions({ state }: { state: LoginPageState }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 sm:top-6 sm:right-6" role="toolbar" aria-label="页面操作">
      <Button
        asChild
        type="button"
        variant="outline"
        size="icon"
        className="size-9 rounded-lg border-border/80 bg-surface/85 text-muted-foreground shadow-2xs backdrop-blur-md hover:border-border-strong hover:bg-surface-hover hover:text-foreground"
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
        className="relative size-9 rounded-lg border-border/80 bg-surface/85 text-muted-foreground shadow-2xs backdrop-blur-md hover:border-border-strong hover:bg-surface-hover hover:text-foreground"
        onClick={state.handleThemeToggle}
        aria-label={state.theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
        title={state.theme === "dark" ? "浅色模式" : "深色模式"}
      >
        <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden="true" />
        <MoonStar className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden="true" />
        <span className="sr-only">切换界面主题</span>
      </Button>
    </div>
  );
}
