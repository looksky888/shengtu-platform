import type { ComponentType, ReactNode } from "react";
import { Navigate } from "react-router-dom";

import {
  AccountsPage,
  AdminOverviewPage,
  CreditsAdminPage,
  HomePage,
  ICloudPage,
  ImageManagerPage,
  ImagePage,
  LoginPage,
  LogsPage,
  PaymentAdminPage,
  ProfilePage,
  RBACPage,
  RechargePage,
  SettingsPage,
  TaskQueuePage,
  UsersPage,
  VideoLibraryPage,
  VideoPage,
} from "@/app/route-components";
import { LazyPage } from "@/app/route-lazy-page";
import {
  AdminAccountsBookmarkRedirect,
  AdminLogsBookmarkRedirect,
  AdminSettingsBookmarkRedirect,
  AdminTabBookmarkRedirect,
  AdminUsersBookmarkRedirect,
  AssetsBookmarkRedirect,
  TasksBookmarkRedirect,
  WalletBookmarkRedirect,
} from "@/app/route-redirects";

export type AppRouteConfig = {
  path: string;
  element: ReactNode;
  requiredPath?: string;
};

function lazyPage(Page: ComponentType) {
  return <LazyPage Page={Page} />;
}

export const appRoutes: AppRouteConfig[] = [
  { path: "/", element: lazyPage(HomePage) },
  { path: "/login", element: lazyPage(LoginPage) },

  // Classic Primary Creative & User Routes
  { path: "/image", element: lazyPage(ImagePage), requiredPath: "/image" },
  { path: "/video", element: lazyPage(VideoPage), requiredPath: "/video" },
  {
    path: "/video-library",
    element: lazyPage(VideoLibraryPage),
    requiredPath: "/video-library",
  },
  {
    path: "/image-manager",
    element: lazyPage(ImageManagerPage),
    requiredPath: "/image-manager",
  },
  {
    path: "/recharge",
    element: lazyPage(RechargePage),
    requiredPath: "/recharge",
  },
  { path: "/profile", element: lazyPage(ProfilePage), requiredPath: "/profile" },

  // Classic Operations, Business & System Routes
  {
    path: "/overview",
    element: lazyPage(AdminOverviewPage),
    requiredPath: "/overview",
  },
  {
    path: "/task-queue",
    element: lazyPage(TaskQueuePage),
    requiredPath: "/task-queue",
  },
  {
    path: "/accounts",
    element: lazyPage(AccountsPage),
    requiredPath: "/accounts",
  },
  { path: "/icloud", element: lazyPage(ICloudPage), requiredPath: "/icloud" },
  { path: "/users", element: lazyPage(UsersPage), requiredPath: "/users" },
  {
    path: "/credits-admin",
    element: lazyPage(CreditsAdminPage),
    requiredPath: "/credits-admin",
  },
  {
    path: "/payment-admin",
    element: lazyPage(PaymentAdminPage),
    requiredPath: "/payment-admin",
  },
  { path: "/rbac", element: lazyPage(RBACPage), requiredPath: "/rbac" },
  { path: "/logs", element: lazyPage(LogsPage), requiredPath: "/logs" },
  {
    path: "/settings",
    element: lazyPage(SettingsPage),
    requiredPath: "/settings",
  },

  // v6 Bookmark Compatibility Redirects
  { path: "/assets", element: <AssetsBookmarkRedirect />, requiredPath: "/assets" },
  { path: "/wallet", element: <WalletBookmarkRedirect />, requiredPath: "/wallet" },
  { path: "/tasks", element: <TasksBookmarkRedirect />, requiredPath: "/tasks" },
  {
    path: "/image-task-logs",
    element: <Navigate to="/task-queue?tab=history" replace />,
    requiredPath: "/task-queue",
  },
  {
    path: "/admin",
    element: <Navigate to="/overview" replace />,
    requiredPath: "/overview",
  },
  {
    path: "/admin/channels",
    element: <Navigate to="/settings?tab=channels" replace />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/clearance",
    element: <Navigate to="/settings?tab=proxy" replace />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/announcements",
    element: <Navigate to="/settings?tab=announcements" replace />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/settings",
    element: <Navigate to="/settings?tab=config" replace />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/settings/appearance",
    element: <AdminSettingsBookmarkRedirect defaultTab="config" />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/settings/access",
    element: <AdminSettingsBookmarkRedirect defaultTab="email" />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/settings/storage",
    element: <AdminSettingsBookmarkRedirect defaultTab="media" />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/settings/system",
    element: <AdminSettingsBookmarkRedirect defaultTab="system" />,
    requiredPath: "/settings",
  },
  {
    path: "/admin/accounts",
    element: <AdminAccountsBookmarkRedirect />,
    requiredPath: "/admin/accounts",
  },
  {
    path: "/admin/users",
    element: <AdminUsersBookmarkRedirect />,
    requiredPath: "/admin/users",
  },
  {
    path: "/admin/credits",
    element: <AdminTabBookmarkRedirect to="/credits-admin" />,
    requiredPath: "/credits-admin",
  },
  {
    path: "/admin/payments",
    element: <AdminTabBookmarkRedirect to="/payment-admin" />,
    requiredPath: "/payment-admin",
  },
  {
    path: "/admin/logs",
    element: <AdminLogsBookmarkRedirect />,
    requiredPath: "/admin/logs",
  },
  {
    path: "/admin/*",
    element: <Navigate to="/overview" replace />,
    requiredPath: "/overview",
  },

  { path: "*", element: lazyPage(HomePage) },
];
