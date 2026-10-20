import {
  BookOpen,
  Coins,
  KeyRound,
  RefreshCw,
  UserCircle2,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ProfileAccountCard } from "@/app/profile/profile-account-card";
import { ProfileApiDocsPanel } from "@/app/profile/profile-api-docs-panel";
import { ProfileApiKeyCard } from "@/app/profile/profile-api-key-card";
import { ProfileApiKeyDialogs } from "@/app/profile/profile-api-key-dialogs";
import { ProfileCreditsCard } from "@/app/profile/profile-credits-card";
import { ProfileInviteRedeemCard } from "@/app/profile/profile-invite-redeem-card";
import { ProfilePasswordCard } from "@/app/profile/profile-password-card";
import { ProfileSummaryCard } from "@/app/profile/profile-summary-card";
import { sessionRoleLabel } from "@/app/profile/profile-utils";
import { useProfileAccount } from "@/app/profile/use-profile-account";
import { useProfileApiKey } from "@/app/profile/use-profile-api-key";
import { useProfileCredits } from "@/app/profile/use-profile-credits";
import { useProfileInvite } from "@/app/profile/use-profile-invite";
import { useProfilePassword } from "@/app/profile/use-profile-password";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

export type ProfileTab = "account" | "api" | "credits";

const PROFILE_TABS: SubNavItem<ProfileTab>[] = [
  {
    value: "account",
    label: "概览与账号安全",
    icon: UserCircle2,
  },
  {
    value: "api",
    label: "接口密钥与 API 文档",
    icon: KeyRound,
  },
  {
    value: "credits",
    label: "积分中心与流水",
    icon: Coins,
  },
];

function parseProfileTab(raw: string | null): ProfileTab {
  if (raw === "api" || raw === "docs") return "api";
  if (raw === "credits") return "credits";
  return "account";
}

export function ProfileContent({ session }: { session: StoredAuthSession }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseProfileTab(searchParams.get("tab"));

  const account = useProfileAccount(session);
  const apiKey = useProfileApiKey();
  const credits = useProfileCredits();
  const invite = useProfileInvite();
  const accountPassword = useProfilePassword();
  const roleLabel = sessionRoleLabel(account.currentSession);
  const isRefreshing =
    apiKey.isLoadingKey || credits.isLoadingCredits || invite.isLoadingInvite;

  const { loadKey } = apiKey;
  const { loadCredits } = credits;
  const { loadInvite } = invite;

  const loadProfileData = useCallback(async () => {
    await Promise.allSettled([loadKey(), loadCredits(), loadInvite()]);
  }, [loadCredits, loadInvite, loadKey]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const handleTabChange = (next: ProfileTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "account") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", next);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleCopy = async (value: string, label?: string) => {
    try {
      await copyText(value);
      toast.success(label ? `已复制 ${label}` : "已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const scrollToDocs = () => {
    if (activeTab !== "api") {
      handleTabChange("api");
    }
    window.setTimeout(() => {
      document
        .getElementById("profile-api-docs")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow="个人中心"
        title="账号、接口密钥与文档"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={scrollToDocs}
            >
              <BookOpen className="size-3.5 text-brand" />
              API 接口文档
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadProfileData()}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn("size-3.5", isRefreshing ? "animate-spin" : "")}
              />
              刷新
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          items={PROFILE_TABS}
          value={activeTab}
          onValueChange={handleTabChange}
          variant="pill"
          layoutId="profile-main-subnav"
        />
      </div>

      {activeTab === "account" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <ProfileSummaryCard
              session={account.currentSession}
              roleLabel={roleLabel}
              credits={credits.credits}
              isCheckingIn={credits.isCheckingIn}
              onCheckin={() => void credits.handleCheckin()}
            />
            <ProfilePasswordCard
              session={account.currentSession}
              currentPassword={accountPassword.currentPassword}
              newPassword={accountPassword.newPassword}
              confirmPassword={accountPassword.confirmPassword}
              isChangingPassword={accountPassword.isChangingPassword}
              onCurrentPasswordChange={accountPassword.setCurrentPassword}
              onNewPasswordChange={accountPassword.setNewPassword}
              onConfirmPasswordChange={accountPassword.setConfirmPassword}
              onChangePassword={() =>
                void accountPassword.handleChangePassword()
              }
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
          </div>
        </div>
      ) : null}

      {activeTab === "api" ? (
        <div className="flex min-w-0 flex-col gap-5">
          <ProfileApiKeyCard
            apiKey={apiKey.key}
            rateLimits={apiKey.rateLimits}
            keyName={apiKey.keyName}
            isNameDirty={apiKey.isNameDirty}
            revealedKey={apiKey.revealedKey}
            activePlaintextKey={apiKey.activePlaintextKey}
            justGeneratedKey={apiKey.justGeneratedKey}
            isKeyVisible={apiKey.isKeyVisible}
            rememberLocally={apiKey.rememberLocally}
            hasKey={apiKey.hasKey}
            isLoadingKey={apiKey.isLoadingKey}
            isSavingName={apiKey.isSavingName}
            isToggling={apiKey.isToggling}
            isGenerating={apiKey.isGenerating}
            isDeleting={apiKey.isDeleting}
            isTesting={apiKey.isTesting}
            testResult={apiKey.testResult}
            onKeyNameChange={apiKey.setKeyName}
            onSaveName={() => void apiKey.handleSaveName()}
            onReveal={apiKey.handleReveal}
            onToggleRememberLocally={apiKey.handleToggleRememberLocally}
            onCopy={(value, label) => void handleCopy(value, label)}
            onToggle={() => void apiKey.handleToggle()}
            onRotateOpen={() => apiKey.setIsRotateDialogOpen(true)}
            onDeleteOpen={() => apiKey.setIsDeleteDialogOpen(true)}
            onGenerate={() => void apiKey.handleGenerate()}
            onTestConnectivity={() => void apiKey.handleTestConnectivity()}
            onOpenDocs={scrollToDocs}
          />
          <ProfileApiDocsPanel
            activePlaintextKey={apiKey.activePlaintextKey}
            onCopy={(value, label) => void handleCopy(value, label)}
          />
        </div>
      ) : null}

      {activeTab === "credits" ? (
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
      ) : null}

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
