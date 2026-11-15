import {
  ArrowUpRight,
  BookOpen,
  Check,
  Coins,
  KeyRound,
  Moon,
  Palette,
  RefreshCw,
  Sun,
  UserCircle2,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { preloadRoute } from "@/app/route-prefetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import { copyText } from "@/lib/clipboard";
import {
  applyColorTheme,
  COLOR_THEME_CHANGE_EVENT,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import { canAccessPath, type StoredAuthSession } from "@/store/auth";

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
    title: "查看积分余额与使用记录",
    icon: Coins,
  },
];

function parseProfileTab(raw: string | null): ProfileTab {
  if (raw === "api" || raw === "docs") return "api";
  if (raw === "credits") return "credits";
  return "account";
}

function ProfileAppearanceCard() {
  const [theme, setTheme] = useState<ColorTheme>(() =>
    getPreferredColorTheme(),
  );

  useEffect(() => {
    const syncTheme = () => setTheme(getPreferredColorTheme());
    window.addEventListener(COLOR_THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(COLOR_THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const handleSelectTheme = (
    nextTheme: ColorTheme,
    button?: HTMLButtonElement | null,
  ) => {
    if (nextTheme === theme) return;
    if (button) {
      const rect = button.getBoundingClientRect();
      applyColorTheme(nextTheme, {
        force: true,
        origin: {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
      });
    } else {
      applyColorTheme(nextTheme, { force: true });
    }
    saveColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  const options: Array<{
    value: ColorTheme;
    title: string;
    subtitle: string;
    swatchClass: string;
    icon: typeof Moon;
  }> = [
    {
      value: "light",
      title: "经典浅色蓝白",
      subtitle: "清爽明亮的蓝白工作台，适合日常生图、改图与阅读文档",
      swatchClass: "bg-[#fbfdff] border-[#cfe0ff] text-[#1456f0]",
      icon: Sun,
    },
    {
      value: "dark",
      title: "夜间深色模式",
      subtitle: "柔和护眼的深色界面，适合夜间长时间看图与创作",
      swatchClass: "bg-slate-900 border-white/15 text-sky-300",
      icon: Moon,
    },
  ];

  return (
    <Card className="border-border bg-[#fbfdff] dark:bg-card">
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#cfe0ff] bg-[#edf4ff] text-[#1456f0] dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-300">
            <Palette className="size-4.5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">
              界面外观主题
            </CardTitle>
            <CardDescription className="truncate">
              切换浅色或深色界面，设置会自动保存在当前浏览器
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const active = theme === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={(event) =>
                handleSelectTheme(option.value, event.currentTarget)
              }
              className={cn(
                "group relative flex flex-col gap-2.5 rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/30",
                active
                  ? "border-[#1456f0] bg-[#edf4ff]/65 shadow-2xs dark:border-sky-400/55 dark:bg-sky-950/35"
                  : "border-border/80 bg-surface/60 hover:border-[#1456f0]/35 hover:bg-surface-muted/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg border",
                      option.swatchClass,
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {option.title}
                  </span>
                </div>
                {active ? (
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#1456f0] text-white">
                    <Check className="size-3 stroke-[2.5]" />
                  </span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {option.subtitle}
              </p>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
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
  const canOpenRecharge = canAccessPath(account.currentSession, "/recharge");
  const isRefreshing =
    apiKey.isLoadingKey || credits.isLoadingCredits || invite.isLoadingInvite;

  const { loadKey } = apiKey;
  const { loadCredits } = credits;
  const { loadInvite } = invite;
  const loadedResourcesRef = useRef<{
    key: boolean;
    credits: boolean;
    invite: boolean;
  }>({ key: false, credits: false, invite: false });

  const loadTabData = useCallback(
    async (tab: ProfileTab, force = false) => {
      const tasks: Promise<unknown>[] = [];
      if (tab === "api") {
        if (force || !loadedResourcesRef.current.key) {
          loadedResourcesRef.current.key = true;
          tasks.push(loadKey());
        }
      } else if (tab === "credits") {
        if (force || !loadedResourcesRef.current.credits) {
          loadedResourcesRef.current.credits = true;
          tasks.push(loadCredits());
        }
      } else {
        if (force || !loadedResourcesRef.current.credits) {
          loadedResourcesRef.current.credits = true;
          tasks.push(loadCredits());
        }
        if (force || !loadedResourcesRef.current.invite) {
          loadedResourcesRef.current.invite = true;
          tasks.push(loadInvite());
        }
      }
      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    },
    [loadCredits, loadInvite, loadKey],
  );

  useEffect(() => {
    void loadTabData(activeTab, false);
  }, [activeTab, loadTabData]);

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

  const scrollToInviteRedeem = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", "account");
    setSearchParams(nextParams, { replace: true });
    window.setTimeout(() => {
      document
        .getElementById("profile-invite-redeem")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      const redeemInput = document.getElementById("profile-redeem-key");
      if (redeemInput instanceof HTMLInputElement) {
        redeemInput.focus({ preventScroll: true });
      }
    }, 60);
  };

  return (
    <section className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 pb-6">
      <PageHeader
        eyebrow="个人设置"
        title="账号安全、外观偏好与接口密钥"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canOpenRecharge ? (
              <Button variant="outline" size="sm" asChild>
                <Link
                  to="/recharge"
                  onMouseEnter={() => preloadRoute("/recharge")}
                >
                  <WalletCards className="size-3.5 text-muted-foreground" />
                  积分与权益中心
                  <ArrowUpRight className="size-3.5 text-muted-foreground" />
                </Link>
              </Button>
            ) : null}
            {activeTab !== "api" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={scrollToDocs}
              >
                <BookOpen className="size-3.5 text-muted-foreground" />
                API 接口文档
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadTabData(activeTab, true)}
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

      <SubNav
        items={PROFILE_TABS}
        value={activeTab}
        onValueChange={handleTabChange}
        variant="underline"
        layoutId="profile-main-subnav"
        ariaLabel="个人设置分区导航"
      />

      {activeTab === "account" ? (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
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

          <div className="flex min-w-0 flex-col gap-4">
            <ProfileAppearanceCard />
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
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-[#fbfdff] px-5 py-4 dark:bg-card">
            <div className="min-w-0 space-y-0.5">
              <div className="text-sm font-semibold text-foreground">
                充值积分与兑换卡密
              </div>
              <p className="text-xs text-muted-foreground">
                需要充值积分、使用兑换码或查看邀请奖励，可直接兑换卡密或前往积分充值页面。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={scrollToInviteRedeem}
              >
                <KeyRound className="size-3.5" />
                兑换码与邀请
              </Button>
              {canOpenRecharge ? (
                <Button
                  size="sm"
                  className="bg-[#1456f0] text-white hover:bg-[#1048ce]"
                  asChild
                >
                  <Link
                    to="/recharge"
                    onMouseEnter={() => preloadRoute("/recharge")}
                  >
                    去充值或兑换积分
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <ProfileCreditsCard
            credits={credits.credits}
            creditsError={credits.creditsError}
            isLoadingCredits={credits.isLoadingCredits}
            isCheckingIn={credits.isCheckingIn}
            displayLatestCreditEntry={credits.displayLatestCreditEntry}
            creditLedger={credits.creditLedger}
            pagedCreditLedger={credits.pagedCreditLedger}
            sortedCreditLedgerLength={credits.sortedCreditLedgerLength}
            safeCreditLedgerPage={credits.safeCreditLedgerPage}
            creditLedgerPageCount={credits.creditLedgerPageCount}
            creditLedgerPageSize={credits.creditLedgerPageSize}
            onCheckin={() => void credits.handleCheckin()}
            onRetry={() => void credits.loadCredits()}
            onPageChange={credits.setCreditLedgerPage}
          />
        </div>
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
