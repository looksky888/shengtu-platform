import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SectionErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
  title?: string;
  compact?: boolean;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
  message: string;
  isChunkError: boolean;
  resetKey?: string;
};

function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "未知错误";
  return raw
    .replace(/Bearer\s+\S+/gi, "[token]")
    .replace(/password[=:]\S+/gi, "[redacted]")
    .slice(0, 240);
}

function isDynamicModuleLoadError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    name === "ChunkLoadError" ||
    /(Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|Unable to preload CSS|error loading dynamically imported module)/i.test(
      message,
    )
  );
}

/**
 * Isolates lazy chunk or section render failures inside the workspace content area
 * so TopNav, dialogs, and sidebar navigation remain interactive and recover cleanly.
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    hasError: false,
    message: "",
    isChunkError: false,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromProps(
    props: SectionErrorBoundaryProps,
    state: SectionErrorBoundaryState,
  ): Partial<SectionErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return {
        hasError: false,
        message: "",
        isChunkError: false,
        resetKey: props.resetKey,
      };
    }
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<SectionErrorBoundaryState> {
    return {
      hasError: true,
      message: sanitizeErrorMessage(error),
      isChunkError: isDynamicModuleLoadError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SectionErrorBoundary", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "", isChunkError: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { compact = false, title } = this.props;
      const { isChunkError, message } = this.state;
      const resolvedTitle =
        title ?? (isChunkError ? "当前模块资源加载失败" : "当前模块渲染出现异常");
      const resolvedDescription = isChunkError
        ? "可能是站点刚刚完成版本更新或网络波动导致模块资源未就绪。您可以直接重试或刷新页面。"
        : "该区域在渲染配置数据时遇到异常，页面其余功能与导航不受影响。您可以点击重试恢复，或刷新页面同步最新数据。";

      return (
        <div
          role="alert"
          className={cn(
            "flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-card text-center shadow-2xs",
            compact ? "min-h-40 p-4" : "min-h-56 p-6",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-status-warning-soft text-status-warning">
            <AlertTriangle className="size-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground sm:text-base">
            {resolvedTitle}
          </p>
          <p className="mt-1.5 max-w-md text-xs leading-5 text-muted-foreground sm:text-sm">
            {resolvedDescription}
          </p>
          {message ? (
            <p className="mt-3 max-w-lg break-words rounded-lg bg-muted/60 px-3 py-1.5 text-left font-mono text-[11px] text-muted-foreground">
              {message}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
            >
              <RotateCcw className="size-3.5" />
              重试
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={this.handleReload}
            >
              <RefreshCw className="size-3.5" />
              刷新页面
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
