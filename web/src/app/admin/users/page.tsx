"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { RBACContent } from "@/app/rbac/page";
import { UsersContent } from "@/app/users/users-content";
import { AdminPageFrame, AdminUnderlineTabs } from "@/components/admin";
import { useAuthGuard } from "@/lib/use-auth-guard";

type UsersAdminTab = "users" | "rbac";

const USERS_TABS = [
  { value: "users" as const, label: "用户管理" },
  { value: "rbac" as const, label: "角色与权限矩阵" },
] as const;

export default function AdminUsersPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/users");
  const [activeTab, setActiveTab] = useState<UsersAdminTab>("users");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  return (
    <AdminPageFrame
      groupLabel="商业与运营"
      title="用户与权限"
      description="统一管理全站用户账户、人工积分调账、近 14 日调用趋势及 RBAC 菜单与接口授权矩阵。"
    >
      <AdminUnderlineTabs
        items={USERS_TABS}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="users"
      />

      {activeTab === "users" ? (
        <UsersContent session={session} embedded />
      ) : (
        <RBACContent embedded />
      )}
    </AdminPageFrame>
  );
}
