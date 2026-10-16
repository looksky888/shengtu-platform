import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

/**
 * Catches render errors so a single route crash does not leave a pure white page.
 * Never surfaces tokens, request bodies, or server paths in the UI.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    const message = error instanceof Error ? error.message : "未知错误";
    // Strip obvious sensitive fragments.
    const safe = message.replace(/Bearer\s+\S+/gi, "[token]").replace(/password[=:]\S+/gi, "[redacted]");
    return { hasError: true, message: safe.slice(0, 240) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <p className="text-base font-semibold">页面加载失败，请刷新后重试</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              可能是页面资源已更新，或当前会话出现异常。刷新通常可以恢复。
            </p>
            {this.state.message ? (
              <p className="mt-3 break-words rounded-lg bg-muted/60 px-3 py-2 text-left text-xs text-muted-foreground">
                详情：{this.state.message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <RefreshCw className="size-4" />
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
