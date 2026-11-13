import { lazyWithRetry } from "@/lib/lazy-with-retry";

export const HomePage = lazyWithRetry(() => import("@/app/page"));
export const LoginPage = lazyWithRetry(() => import("@/app/login/page"));
export const ImagePage = lazyWithRetry(() => import("@/app/image/page"));
export const VideoPage = lazyWithRetry(() => import("@/app/video/page"));
export const TasksPage = lazyWithRetry(() => import("@/app/tasks/page"));
export const AssetsPage = lazyWithRetry(() => import("@/app/assets/page"));
export const WalletPage = lazyWithRetry(() => import("@/app/wallet/page"));
export const ProfilePage = lazyWithRetry(() => import("@/app/profile/page"));

export const AdminOverviewPage = lazyWithRetry(() => import("@/app/admin/overview/page"));
export const AdminChannelsPage = lazyWithRetry(() => import("@/app/admin/channels/page"));
export const AdminAccountsPage = lazyWithRetry(() => import("@/app/admin/accounts/page"));
export const AdminClearancePage = lazyWithRetry(() => import("@/app/admin/clearance/page"));
export const AdminUsersPage = lazyWithRetry(() => import("@/app/admin/users/page"));
export const AdminAnnouncementsPage = lazyWithRetry(() => import("@/app/admin/announcements/page"));
export const AdminPaymentsPage = lazyWithRetry(() => import("@/app/admin/payments/page"));
export const AdminCreditsPage = lazyWithRetry(() => import("@/app/admin/credits/page"));
export const AdminLogsPage = lazyWithRetry(() => import("@/app/admin/logs/page"));
export const AdminAppearanceSettingsPage = lazyWithRetry(() => import("@/app/admin/settings/appearance/page"));
export const AdminAccessSettingsPage = lazyWithRetry(() => import("@/app/admin/settings/access/page"));
export const AdminStorageSettingsPage = lazyWithRetry(() => import("@/app/admin/settings/storage/page"));
export const AdminSystemSettingsPage = lazyWithRetry(() => import("@/app/admin/settings/system/page"));
