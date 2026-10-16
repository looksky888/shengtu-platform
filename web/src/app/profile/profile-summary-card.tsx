import { UserCircle2 } from "lucide-react";

import { ProfileInfoRow } from "@/app/profile/profile-info-row";
import { providerLabel } from "@/app/profile/profile-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoredAuthSession } from "@/store/auth";

type ProfileSummaryCardProps = {
  session: StoredAuthSession;
  roleLabel: string;
};

export function ProfileSummaryCard({ session, roleLabel }: ProfileSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <UserCircle2 className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">{session.name || "用户"}</CardTitle>
              <CardDescription className="truncate">{session.subjectId || "—"}</CardDescription>
            </div>
          </div>
          <Badge variant={session.role === "admin" ? "violet" : "secondary"} className="shrink-0 rounded-md">
            {roleLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ProfileInfoRow label="用户 ID" value={session.subjectId} code />
        <ProfileInfoRow label="登录来源" value={providerLabel(session.provider)} />
        <ProfileInfoRow label="角色 ID" value={session.roleId || session.role} code />
      </CardContent>
    </Card>
  );
}
