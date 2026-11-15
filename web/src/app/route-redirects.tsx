import { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { getCachedAuthSession } from "@/lib/session";
import { ResolvedAuthSessionContext } from "@/lib/use-auth-guard";
import { canAccessPath, getDefaultRouteForSession } from "@/store/auth";

export function AssetsBookmarkRedirect() {
  const location = useLocation();
  const contextSession = useContext(ResolvedAuthSessionContext);
  const session =
    contextSession !== undefined ? contextSession : getCachedAuthSession();
  const params = new URLSearchParams(location.search);
  const type = params.get("type");
  const view = params.get("view") || params.get("scope");
  const query = view ? `?view=${encodeURIComponent(view)}` : "";
  const preferVideoLibrary =
    type === "video" ||
    Boolean(
      session &&
        !canAccessPath(session, "/image-manager") &&
        canAccessPath(session, "/video-library"),
    );
  if (preferVideoLibrary) {
    return <Navigate to={`/video-library${query}`} replace />;
  }
  return <Navigate to={`/image-manager${query}`} replace />;
}

export function WalletBookmarkRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab")?.trim();
  if (tab) {
    return <Navigate to={`/recharge?tab=${encodeURIComponent(tab)}`} replace />;
  }
  return <Navigate to="/recharge" replace />;
}

export function TasksBookmarkRedirect() {
  const contextSession = useContext(ResolvedAuthSessionContext);
  const session =
    contextSession !== undefined ? contextSession : getCachedAuthSession();
  if (session && canAccessPath(session, "/task-queue")) {
    return <Navigate to="/task-queue" replace />;
  }
  if (session && canAccessPath(session, "/image")) {
    return <Navigate to="/image" replace />;
  }
  return (
    <Navigate
      to={session ? getDefaultRouteForSession(session) : "/image"}
      replace
    />
  );
}

export function AdminAccountsBookmarkRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  const platform = params.get("platform");
  if (tab === "icloud") {
    return <Navigate to="/icloud" replace />;
  }
  if (tab === "cpa") {
    return <Navigate to="/settings?tab=cpa" replace />;
  }
  if (platform === "grok") {
    return <Navigate to="/accounts?platform=grok" replace />;
  }
  return <Navigate to="/accounts" replace />;
}

export function AdminUsersBookmarkRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "rbac") {
    return <Navigate to="/rbac" replace />;
  }
  return <Navigate to="/users" replace />;
}

export function AdminLogsBookmarkRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "tasks") {
    return (
      <Navigate
        to={
          params.get("view") === "history"
            ? "/task-queue?tab=history"
            : "/task-queue"
        }
        replace
      />
    );
  }
  return <Navigate to="/logs" replace />;
}

export function AdminSettingsBookmarkRedirect({
  defaultTab,
}: {
  defaultTab: string;
}) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const subtab = params.get("tab");
  if (defaultTab === "media" && subtab === "backup") {
    return <Navigate to="/settings?tab=backup" replace />;
  }
  if (defaultTab === "system" && subtab === "governance") {
    return <Navigate to="/settings?tab=backup" replace />;
  }
  return <Navigate to={`/settings?tab=${defaultTab}`} replace />;
}

export function AdminTabBookmarkRedirect({ to }: { to: string }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab")?.trim();
  if (tab) {
    return <Navigate to={`${to}?tab=${encodeURIComponent(tab)}`} replace />;
  }
  return <Navigate to={to} replace />;
}
