import { lazy } from "react";

export const AccountsPage = lazy(() => import("@/app/accounts/page"));
export const CreditsAdminPage = lazy(() => import("@/app/credits-admin/page"));
export const ICloudPage = lazy(() => import("@/app/icloud/page"));
export const ImagePage = lazy(() => import("@/app/image/page"));
export const ImageManagerPage = lazy(() => import("@/app/image-manager/page"));
export const ImageTaskLogsPage = lazy(() => import("@/app/image-task-logs/page"));
export const TaskQueuePage = lazy(() => import("@/app/task-queue/page"));
export const LogsPage = lazy(() => import("@/app/logs/page"));
export const ProfilePage = lazy(() => import("@/app/profile/page"));
export const PaymentAdminPage = lazy(() => import("@/app/payment-admin/page"));
export const RechargePage = lazy(() => import("@/app/recharge/page"));
export const RBACPage = lazy(() => import("@/app/rbac/page"));
export const RegisterPage = lazy(() => import("@/app/register/page"));
export const SettingsPage = lazy(() => import("@/app/settings/page"));
export const UsersPage = lazy(() => import("@/app/users/page"));
export const VideoPage = lazy(() => import("@/app/video/page"));
export const VideoLibraryPage = lazy(() => import("@/app/video-library/page"));
