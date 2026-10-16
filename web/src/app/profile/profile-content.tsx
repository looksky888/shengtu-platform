import { useCallback, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ProfileAccountCard } from "@/app/profile/profile-account-card";
import { ProfileApiKeyCard } from "@/app/profile/profile-api-key-card";
import { ProfileApiKeyDialogs } from "@/app/profile/profile-api-key-dialogs";
import { ProfileCreditsCard } from "@/app/profile/profile-credits-card";
import { ProfileInviteRedeemCard } from "@/app/profile/profile-invite-redeem-card";
import { ProfilePasswordCard } from "@/app/profile/profile-password-card";
import { ProfileSummaryCard } from "@/app/profile/profile-summary-card";
import { useProfileAccount } from "@/app/profile/use-profile-account";
import { useProfileApiKey } from "@/app/profile/use-profile-api-key";
import { useProfileCredits } from "@/app/profile/use-profile-credits";
import { useProfileInvite } from "@/app/profile/use-profile-invite";
import { useProfilePassword } from "@/app/profile/use-profile-password";
import { sessionRoleLabel } from "@/app/profile/profile-utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

export function ProfileContent({ session }: { session: StoredAuthSession }) {
  const account = useProfileAccount(session);
  const apiKey = useProfileApiKey();
  const credits = useProfileCredits();
  const invite = useProfileInvite();
  const accountPassword = useProfilePassword();
  const roleLabel = sessionRoleLabel(account.currentSession);
  const isRefreshing = apiKey.isLoadingKey || credits.isLoadingCredits || invite.isLoadingInvite;

  const { loadKey } = apiKey;
  const { loadCredits } = credits;
  const { loadInvite } = invite;

  const loadProfileData = useCallback(async () => {
    await Promise.allSettled([loadKey(), loadCredits(), loadInvite()]);
  }, [loadCredits, loadInvite, loadKey]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const handleCopy = async (value: string) => {
    try {
      await copyText(value);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="个人中心"
        title="个人中心"
        actions={
          <Button variant="outline" onClick={() => void loadProfileData()} disabled={isRefreshing} className="h-10 rounded-lg">
            <RefreshCw className={cn("size-4", isRefreshing ? "animate-spin" : "")} />
            刷新
          </Button>
        }
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ProfileSummaryCard session={account.currentSession} roleLabel={roleLabel} />
          <ProfilePasswordCard
            session={account.currentSession}
            credits={credits.credits}
            currentPassword={accountPassword.currentPassword}
            newPassword={accountPassword.newPassword}
            confirmPassword={accountPassword.confirmPassword}
            isChangingPassword={accountPassword.isChangingPassword}
            isCheckingIn={credits.isCheckingIn}
            onCurrentPasswordChange={accountPassword.setCurrentPassword}
            onNewPasswordChange={accountPassword.setNewPassword}
            onConfirmPasswordChange={accountPassword.setConfirmPassword}
            onChangePassword={() => void accountPassword.handleChangePassword()}
            onCheckin={() => void credits.handleCheckin()}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ProfileAccountCard
            session={account.currentSession}
            profileName={account.profileName}
            isProfileNameDirty={account.isProfileNameDirty}
            isSavingProfile={account.isSavingProfile}
            onProfileNameChange={account.setProfileName}
            onSaveProfile={() => void account.handleSaveProfile()}
          />
          <ProfileInviteRedeemCard
            inviteInfo={invite.inviteInfo}
            inviteLink={invite.inviteLink}
            inviteError={invite.inviteError}
            isLoadingInvite={invite.isLoadingInvite}
            redeemKey={credits.redeemKey}
            isRedeeming={credits.isRedeeming}
            onCopy={(value) => void handleCopy(value)}
            onRetryInvite={() => void invite.loadInvite()}
            onRedeemKeyChange={credits.setRedeemKey}
            onRedeem={() => void credits.handleRedeem()}
          />
          <ProfileApiKeyCard
            apiKey={apiKey.key}
            keyName={apiKey.keyName}
            isNameDirty={apiKey.isNameDirty}
            revealedKey={apiKey.revealedKey}
            hasKey={apiKey.hasKey}
            isLoadingKey={apiKey.isLoadingKey}
            isSavingName={apiKey.isSavingName}
            isRevealing={apiKey.isRevealing}
            isToggling={apiKey.isToggling}
            isGenerating={apiKey.isGenerating}
            isDeleting={apiKey.isDeleting}
            onKeyNameChange={apiKey.setKeyName}
            onSaveName={() => void apiKey.handleSaveName()}
            onReveal={() => void apiKey.handleReveal()}
            onCopy={(value) => void handleCopy(value)}
            onToggle={() => void apiKey.handleToggle()}
            onRotateOpen={() => apiKey.setIsRotateDialogOpen(true)}
            onDeleteOpen={() => apiKey.setIsDeleteDialogOpen(true)}
            onGenerate={() => void apiKey.handleGenerate()}
          />
        </div>
      </div>

      <ProfileCreditsCard
        credits={credits.credits}
        creditsError={credits.creditsError}
        isLoadingCredits={credits.isLoadingCredits}
        displayLatestCreditEntry={credits.displayLatestCreditEntry}
        creditLedger={credits.creditLedger}
        pagedCreditLedger={credits.pagedCreditLedger}
        sortedCreditLedgerLength={credits.sortedCreditLedgerLength}
        safeCreditLedgerPage={credits.safeCreditLedgerPage}
        creditLedgerPageCount={credits.creditLedgerPageCount}
        creditLedgerPageSize={credits.creditLedgerPageSize}
        onRetry={() => void credits.loadCredits()}
        onPageChange={credits.setCreditLedgerPage}
      />

      <ProfileApiKeyDialogs
        keyName={apiKey.key?.name || "我的 API 令牌"}
        isGenerating={apiKey.isGenerating}
        isDeleting={apiKey.isDeleting}
        isRotateDialogOpen={apiKey.isRotateDialogOpen}
        isDeleteDialogOpen={apiKey.isDeleteDialogOpen}
        onRotateOpenChange={apiKey.setIsRotateDialogOpen}
        onDeleteOpenChange={apiKey.setIsDeleteDialogOpen}
        onGenerate={() => void apiKey.handleGenerate()}
        onDelete={() => void apiKey.handleDelete()}
      />
    </section>
  );
}
