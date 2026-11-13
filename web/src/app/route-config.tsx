import { useContext, type ComponentType, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import {
  AdminAccessSettingsPage,
  AdminAccountsPage,
  AdminAnnouncementsPage,
  AdminAppearanceSettingsPage,
  AdminChannelsPage,
  AdminClearancePage,
  AdminCreditsPage,
  AdminLogsPage,
  AdminOverviewPage,
  AdminPaymentsPage,
  AdminStorageSettingsPage,
  AdminSystemSettingsPage,
  AdminUsersPage,
  AssetsPage,
  HomePage,
  ImagePage,
  LoginPage,
  ProfilePage,
  TasksPage,
  VideoPage,
  WalletPage,
} from "@/app/route-components";
import { LazyPage } from "@/app/route-lazy-page";
import { resolveLegacySettingsRedirect } from "@/components/admin/admin-navigation";
import {
  resolveLegacyImageManagerRedirect,
  resolveLegacyVideoLibraryRedirect,
} from "@/components/workspace/workspace-navigation";
import { getCachedAuthSession } from "@/lib/session";
import { ResolvedAuthSessionContext } from "@/lib/use-auth-guard";
import { canAccessPath, getDefaultRouteForSession } from "@/store/auth";

export type AppRouteConfig = {
  path: string;
  element: ReactNode;
  requiredPath?: string;
};

const ADMIN_SETTINGS_CHILD_ROUTES = [
  "/admin/settings/appearance",
  "/admin/settings/access",
  "/admin/settings/storage",
  "/admin/settings/system",
] as const;

function lazyPage(Page: ComponentType) {
  return <LazyPage Page={Page} />;
}

function LegacyImageManagerRedirect() {
  const location = useLocation();
  return (
    <Navigate to={resolveLegacyImageManagerRedirect(location.search)} replace />
  );
}

function LegacyVideoLibraryRedirect() {
  const location = useLocation();
  return (
    <Navigate to={resolveLegacyVideoLibraryRedirect(location.search)} replace />
  );
}

function AdminSettingsIndexRedirect() {
  const contextSession = useContext(ResolvedAuthSessionContext);
  const session =
    contextSession !== undefined ? contextSession : getCachedAuthSession();
  const firstAccessible = session
    ? ADMIN_SETTINGS_CHILD_ROUTES.find((path) => canAccessPath(session, path))
    : undefined;
  const target =
    firstAccessible ??
    (session ? getDefaultRouteForSession(session) : "/admin/settings/appearance");
  return <Navigate to={target} replace />;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  const contextSession = useContext(ResolvedAuthSessionContext);
  const session =
    contextSession !== undefined ? contextSession : getCachedAuthSession();
  const resolvedTarget = resolveLegacySettingsRedirect(location.search);
  if (session && !canAccessPath(session, resolvedTarget)) {
    const fallback =
      ADMIN_SETTINGS_CHILD_ROUTES.find((path) => canAccessPath(session, path)) ??
      getDefaultRouteForSession(session);
    return <Navigate to={fallback} replace />;
  }
  return <Navigate to={resolvedTarget} replace />;
}

function LegacyAccountsRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const platform = params.get("platform");
  const target =
    platform === "grok" ? "/admin/accounts?platform=grok" : "/admin/accounts";
  return <Navigate to={target} replace />;
}

function LegacyTaskQueueRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const target =
    params.get("tab") === "history"
      ? "/admin/logs?tab=tasks&view=history"
      : "/admin/logs?tab=tasks";
  return <Navigate to={target} replace />;
}

export const appRoutes: AppRouteConfig[] = [
  { path: "/", element: lazyPage(HomePage) },
  { path: "/login", element: lazyPage(LoginPage) },

  // Yingce User Workspace routes
  { path: "/image", element: lazyPage(ImagePage), requiredPath: "/image" },
  { path: "/video", element: lazyPage(VideoPage), requiredPath: "/video" },
  { path: "/tasks", element: lazyPage(TasksPage), requiredPath: "/tasks" },
  { path: "/assets", element: lazyPage(AssetsPage), requiredPath: "/assets" },
  { path: "/wallet", element: lazyPage(WalletPage), requiredPath: "/wallet" },
  { path: "/profile", element: lazyPage(ProfilePage), requiredPath: "/profile" },

  // Legacy User Route Redirects
  {
    path: "/image-manager",
    element: <LegacyImageManagerRedirect />,
    requiredPath: "/assets",
  },
  {
    path: "/video-library",
    element: <LegacyVideoLibraryRedirect />,
    requiredPath: "/assets",
  },
  {
    path: "/recharge",
    element: <Navigate to="/wallet" replace />,
    requiredPath: "/wallet",
  },

  // Yingce Admin Console routes (/admin/*)
  { path: "/admin", element: lazyPage(AdminOverviewPage), requiredPath: "/admin" },
  { path: "/admin/channels", element: lazyPage(AdminChannelsPage), requiredPath: "/admin/channels" },
  { path: "/admin/accounts", element: lazyPage(AdminAccountsPage), requiredPath: "/admin/accounts" },
  { path: "/admin/clearance", element: lazyPage(AdminClearancePage), requiredPath: "/admin/clearance" },
  { path: "/admin/users", element: lazyPage(AdminUsersPage), requiredPath: "/admin/users" },
  { path: "/admin/announcements", element: lazyPage(AdminAnnouncementsPage), requiredPath: "/admin/announcements" },
  { path: "/admin/payments", element: lazyPage(AdminPaymentsPage), requiredPath: "/admin/payments" },
  { path: "/admin/credits", element: lazyPage(AdminCreditsPage), requiredPath: "/admin/credits" },
  { path: "/admin/logs", element: lazyPage(AdminLogsPage), requiredPath: "/admin/logs" },
  {
    path: "/admin/settings",
    element: <AdminSettingsIndexRedirect />,
    requiredPath: "/admin/settings",
  },
  {
    path: "/admin/settings/appearance",
    element: lazyPage(AdminAppearanceSettingsPage),
    requiredPath: "/admin/settings/appearance",
  },
  {
    path: "/admin/settings/access",
    element: lazyPage(AdminAccessSettingsPage),
    requiredPath: "/admin/settings/access",
  },
  {
    path: "/admin/settings/storage",
    element: lazyPage(AdminStorageSettingsPage),
    requiredPath: "/admin/settings/storage",
  },
  {
    path: "/admin/settings/system",
    element: lazyPage(AdminSystemSettingsPage),
    requiredPath: "/admin/settings/system",
  },
  {
    path: "/admin/*",
    element: <Navigate to="/admin" replace />,
    requiredPath: "/admin",
  },

  // Legacy Admin Route Redirects (preserving RBAC compatibility)
  { path: "/accounts", element: <LegacyAccountsRedirect />, requiredPath: "/accounts" },
  { path: "/icloud", element: <Navigate to="/admin/accounts?tab=icloud" replace />, requiredPath: "/icloud" },
  { path: "/users", element: <Navigate to="/admin/users" replace />, requiredPath: "/users" },
  { path: "/rbac", element: <Navigate to="/admin/users?tab=rbac" replace />, requiredPath: "/rbac" },
  { path: "/credits-admin", element: <Navigate to="/admin/credits" replace />, requiredPath: "/credits-admin" },
  { path: "/payment-admin", element: <Navigate to="/admin/payments" replace />, requiredPath: "/payment-admin" },
  { path: "/task-queue", element: <LegacyTaskQueueRedirect />, requiredPath: "/task-queue" },
  { path: "/image-task-logs", element: <Navigate to="/admin/logs?tab=tasks" replace />, requiredPath: "/image-task-logs" },
  { path: "/logs", element: <Navigate to="/admin/logs?tab=system" replace />, requiredPath: "/logs" },
  { path: "/settings", element: <LegacySettingsRedirect />, requiredPath: "/settings" },

  { path: "*", element: lazyPage(HomePage) },
];
