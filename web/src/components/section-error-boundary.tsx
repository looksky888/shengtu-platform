import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type SectionErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
  title?: string;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
  message: string;
  resetKey?: string;
};

function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "未知错误";
  return raw
    .replace(/Bearer\s+\S+/gi, "[token]")
    .replace(/password[=:]\S+/gi, "[redacted]")
    .slice(0, 240);
}

/**
 * Isolates lazy chunk or section render failures inside the workspace content area
 * so TopNav and sidebar navigation remain interactive and automatically recover on route/tab switch.
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    hasError: false,
    message: "",
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
        resetKey: props.resetKey,
      };
    }
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<SectionErrorBoundaryState> {
    return {
      hasError: true,
      message: sanitizeErrorMessage(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SectionErrorBoundary", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-border/80 bg-card p-6 text-center shadow-2xs"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-status-warning-soft text-status-warning">
            <AlertTriangle className="size-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground sm:text-base">
            {this.props.title ?? "当前模块加载失败"}
          </p>
          <p className="mt-1.5 max-w-md text-xs leading-5 text-muted-foreground sm:text-sm">
            可能是站点刚刚完成版本更新或网络波动导致模块资源未就绪。您可以直接重试或刷新页面。
          </p>
          {this.state.message ? (
            <p className="mt-3 max-w-lg break-words rounded-lg bg-muted/60 px-3 py-1.5 text-left font-mono text-[11px] text-muted-foreground">
              {this.state.message}
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
              重试加载
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
