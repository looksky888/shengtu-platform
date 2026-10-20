import { LoaderCircle, Save, UserPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { StoredAuthSession } from "@/store/auth";

type ProfileAccountCardProps = {
  session: StoredAuthSession;
  profileName: string;
  isProfileNameDirty: boolean;
  isSavingProfile: boolean;
  onProfileNameChange: (value: string) => void;
  onSaveProfile: () => void;
};

export function ProfileAccountCard({
  session,
  profileName,
  isProfileNameDirty,
  isSavingProfile,
  onProfileNameChange,
  onSaveProfile,
}: ProfileAccountCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-border bg-brand-soft text-brand">
            <UserPen className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">账号资料</CardTitle>
            <CardDescription className="truncate">
              {session.subjectId || "—"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-display-name">昵称</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="profile-display-name"
                value={profileName}
                onChange={(event) => onProfileNameChange(event.target.value)}
                placeholder="昵称"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onSaveProfile}
                disabled={!isProfileNameDirty || isSavingProfile}
              >
                {isSavingProfile ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                保存
              </Button>
            </div>
            <FieldDescription>
              昵称会显示在导航栏和接口调用记录中。
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
