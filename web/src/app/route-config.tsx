import type { ComponentType, ReactNode } from "react";

import HomePage from "@/app/page";
import LoginPage from "@/app/login/page";
import {
  AccountsPage,
  CreditsAdminPage,
  ICloudPage,
  ImageManagerPage,
  ImagePage,
  ImageTaskLogsPage,
  LogsPage,
  ProfilePage,
  PaymentAdminPage,
  RechargePage,
  RBACPage,
  RegisterPage,
  SettingsPage,
  TaskQueuePage,
  UsersPage,
  VideoPage,
  VideoLibraryPage,
} from "@/app/route-components";
import { LazyPage } from "@/app/route-lazy-page";

export type AppRouteConfig = {
  path: string;
  element: ReactNode;
  requiredPath?: string;
};

function lazyPage(Page: ComponentType) {
  return <LazyPage Page={Page} />;
}

export const appRoutes: AppRouteConfig[] = [
  { path: "/", element: <HomePage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/accounts", element: lazyPage(AccountsPage), requiredPath: "/accounts" },
  { path: "/icloud", element: lazyPage(ICloudPage), requiredPath: "/icloud" },
  { path: "/register", element: lazyPage(RegisterPage), requiredPath: "/register" },
  { path: "/image-manager", element: lazyPage(ImageManagerPage), requiredPath: "/image-manager" },
  { path: "/users", element: lazyPage(UsersPage), requiredPath: "/users" },
  { path: "/credits-admin", element: lazyPage(CreditsAdminPage), requiredPath: "/credits-admin" },
  { path: "/payment-admin", element: lazyPage(PaymentAdminPage), requiredPath: "/payment-admin" },
  { path: "/recharge", element: lazyPage(RechargePage), requiredPath: "/recharge" },
  { path: "/profile", element: lazyPage(ProfilePage), requiredPath: "/profile" },
  { path: "/rbac", element: lazyPage(RBACPage), requiredPath: "/rbac" },
  { path: "/logs", element: lazyPage(LogsPage), requiredPath: "/logs" },
  { path: "/image-task-logs", element: lazyPage(ImageTaskLogsPage), requiredPath: "/image-task-logs" },
  { path: "/task-queue", element: lazyPage(TaskQueuePage), requiredPath: "/task-queue" },
  { path: "/settings", element: lazyPage(SettingsPage), requiredPath: "/settings" },
  { path: "/image", element: lazyPage(ImagePage), requiredPath: "/image" },
  { path: "/video", element: lazyPage(VideoPage), requiredPath: "/video" },
  { path: "/video-library", element: lazyPage(VideoLibraryPage), requiredPath: "/video-library" },
  { path: "*", element: <HomePage /> },
];

