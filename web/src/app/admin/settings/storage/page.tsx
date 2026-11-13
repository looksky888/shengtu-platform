"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cloud, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { BackupSettingsCard } from "@/app/settings/components/backup-settings-card";
import {
  MediaStorageCard,
  STORAGE_CONFIG_KEYS,
} from "@/app/settings/components/media-storage-card";
import { useRegisterSettingsDirty } from "@/app/settings/settings-dirty-registry-hooks";
import { useSettingsStore } from "@/app/settings/store";
import { useEnsureSettingsConfigLoaded } from "@/app/settings/use-ensure-settings-config";
import {
  AdminPageFrame,
  AdminSectionCard,
  AdminStatTile,
  AdminStatusBadge,
  AdminStickyCommandBar,
  AdminUnderlineTabs,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  fetchPaymentSettings,
  updatePaymentSettings,
  type PaymentSettings,
} from "@/lib/payment-admin-api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

type StorageAdminTab = "media" | "backup";

const STORAGE_TABS = [
  { value: "media" as const, label: "媒体存储与云存储 VIP 总开关" },
  { value: "backup" as const, label: "SQLite 定时热备与容灾" },
] as const;

const DEFAULT_PAYMENT_VIP_SETTINGS: PaymentSettings = {
  recharge_enabled: true,
  custom_credits_enabled: false,
  cloud_storage_enabled: false,
  free_retention_days: 3,
  vip_grace_days: 7,
  historical_grace_days: 7,
  credit_unit_price_fen: 10,
  min_custom_credits: 10,
  max_custom_credits: 10000,
};

function normalizeVipFields(item: PaymentSettings): PaymentSettings {
  return {
    ...item,
    cloud_storage_enabled: Boolean(item.cloud_storage_enabled),
    free_retention_days: Math.max(1, Number(item.free_retention_days) || 3),
    vip_grace_days: Math.max(1, Number(item.vip_grace_days) || 7),
    historical_grace_days: Math.max(1, Number(item.historical_grace_days) || 7),
  };
}

export { STORAGE_CONFIG_KEYS };

export default function AdminStorageSettingsPage() {
  const { isCheckingAuth, session } = useAuthGuard(
    undefined,
    "/admin/settings/storage",
  );
  const [activeTab, setActiveTab] = useState<StorageAdminTab>("media");

  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const loadConfig = useSettingsStore((state) => state.loadConfig);

  useEnsureSettingsConfigLoaded(Boolean(session));

  const [vipForm, setVipForm] = useState<PaymentSettings>(
    DEFAULT_PAYMENT_VIP_SETTINGS,
  );
  const [vipBaseline, setVipBaseline] = useState<PaymentSettings>(
    DEFAULT_PAYMENT_VIP_SETTINGS,
  );
  const [loadingVip, setLoadingVip] = useState(true);
  const [vipLoadError, setVipLoadError] = useState(false);
  const [savingVip, setSavingVip] = useState(false);

  const loadVipSettings = useCallback(async (silent = false) => {
    if (!silent) setLoadingVip(true);
    try {
      const res = await fetchPaymentSettings();
      const normalized = normalizeVipFields(res.item);
      setVipForm(normalized);
      setVipBaseline(normalized);
      setVipLoadError(false);
    } catch (error) {
      setVipLoadError(true);
      if (!silent) {
        toast.error(
          error instanceof Error
            ? error.message
            : "读取云存储 VIP 总开关配置失败",
        );
      }
    } finally {
      if (!silent) setLoadingVip(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadVipSettings();
  }, [loadVipSettings, session]);

  const vipDirty = useMemo(() => {
    return (
      vipForm.cloud_storage_enabled !== vipBaseline.cloud_storage_enabled ||
      (vipForm.free_retention_days ?? 3) !==
        (vipBaseline.free_retention_days ?? 3) ||
      (vipForm.vip_grace_days ?? 7) !== (vipBaseline.vip_grace_days ?? 7) ||
      (vipForm.historical_grace_days ?? 7) !==
        (vipBaseline.historical_grace_days ?? 7)
    );
  }, [vipBaseline, vipForm]);

  const handleSaveVipSettings = useCallback(async (): Promise<boolean> => {
    if (vipLoadError) {
      toast.error("云存储 VIP 配置尚未成功加载，已禁止覆盖保存，请先点击重试");
      return false;
    }
    const freeDays = Math.max(1, Math.min(3650, Number(vipForm.free_retention_days) || 3));
    const vipGrace = Math.max(1, Math.min(3650, Number(vipForm.vip_grace_days) || 7));
    const histGrace = Math.max(1, Math.min(3650, Number(vipForm.historical_grace_days) || 7));

    setSavingVip(true);
    try {
      // Re-fetch latest recharge settings first so saving cloud VIP fields never clobbers edits made elsewhere.
      const latest = (await fetchPaymentSettings()).item;
      const payload: PaymentSettings = {
        ...latest,
        cloud_storage_enabled: Boolean(vipForm.cloud_storage_enabled),
        free_retention_days: freeDays,
        vip_grace_days: vipGrace,
        historical_grace_days: histGrace,
      };
      const res = await updatePaymentSettings(payload);
      const saved = normalizeVipFields(res.item);
      setVipForm(saved);
      setVipBaseline(saved);
      setVipLoadError(false);
      toast.success(
        saved.cloud_storage_enabled
          ? "已启用云存储付费会员制（VIP 留存策略）"
          : "已关闭云存储会员制，R2 / 本地媒体恢复永久留存",
      );
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存云存储总开关失败");
      return false;
    } finally {
      setSavingVip(false);
    }
  }, [vipForm, vipLoadError]);

  useRegisterSettingsDirty({
    id: "admin-page-storage-vip",
    tab: "storage",
    label: "云存储 VIP 总开关",
    isDirty: vipDirty && !vipLoadError,
    save: handleSaveVipSettings,
    discard: () => {
      setVipForm(vipBaseline);
      return true;
    },
  });

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  const providerLabel =
    config?.media_storage_provider === "r2"
      ? "Cloudflare R2 对象存储"
      : "Local 本地磁盘存储";

  return (
    <AdminPageFrame
      groupLabel="系统配置"
      title="存储与备份"
      description="统一管理云存储付费会员制（VIP 留存策略）总开关、Cloudflare R2 媒体后端迁移及 SQLite 定时热备。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingVip || isLoadingConfig}
          onClick={() => {
            void loadVipSettings();
            void loadConfig();
          }}
        >
          <RefreshCw
            className={cn(
              "size-3.5",
              (loadingVip || isLoadingConfig) && "animate-spin",
            )}
          />
          刷新状态
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="云存储 VIP 会员总开关"
          value={vipForm.cloud_storage_enabled ? "ON · 商业化留存" : "OFF · 永久留存"}
          tone={vipForm.cloud_storage_enabled ? "success" : "default"}
          hint={
            vipForm.cloud_storage_enabled
              ? "前台开启 ¥9.9 VIP 订阅入口与到期缓冲回收"
              : "前台隐藏所有 VIP 提示，所有图片永久保留"
          }
        />
        <AdminStatTile
          label="当前媒体存储引擎"
          value={providerLabel}
          tone={config?.media_storage_provider === "r2" ? "info" : "default"}
          hint={
            config?.media_storage_provider === "r2"
              ? `Bucket: ${config?.media_r2_bucket || "未命名"}`
              : "存储于服务端本地数据目录"
          }
        />
        <AdminStatTile
          label="免费留存 / 双重缓冲期"
          value={`${vipForm.free_retention_days ?? 3}d / ${vipForm.vip_grace_days ?? 7}d / ${vipForm.historical_grace_days ?? 7}d`}
          hint="免费保留天数 · VIP 宽限期 · 历史存量保护期"
        />
      </div>

      <AdminUnderlineTabs
        items={STORAGE_TABS}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="media"
      />

      {activeTab === "media" ? (
        <div className="space-y-4">
          <AdminStickyCommandBar
            dirty={vipDirty && !vipLoadError}
            saving={savingVip}
            disabled={loadingVip || vipLoadError}
            cleanSummary={
              vipLoadError
                ? "读取云存储与支付业务配置失败，已锁定保存以保护线上单价与配置"
                : "云存储付费会员制（VIP 留存策略）总开关与缓冲天数已同步"
            }
            dirtySummary="云存储付费会员制总开关或留存宽限天数存在未保存修改"
            onSave={() => void handleSaveVipSettings()}
            onReset={() => setVipForm(vipBaseline)}
          />

          {vipLoadError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-[12px] text-[var(--admin-text)]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--admin-warning)]" />
                <span>
                  未能读取当前线上支付与云存储配置，系统已暂时禁用下方 VIP 开关保存，避免使用本地回退默认值覆盖线上积分单价等参数。
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingVip}
                onClick={() => void loadVipSettings()}
              >
                <RefreshCw className={cn("size-3.5", loadingVip && "animate-spin")} />
                重试读取
              </Button>
            </div>
          ) : null}

          {/* Dedicated Top Card: Cloud Storage Paid VIP Master Switch */}
          <AdminSectionCard
            title="云存储付费会员制（VIP 留存策略）总开关"
            description="控制是否启用云端画廊阶梯留存与 ¥9.9 月卡商业化能力（接口：GET / PUT /api/admin/payments/settings）"
            actions={
              <AdminStatusBadge
                tone={vipForm.cloud_storage_enabled ? "success" : "neutral"}
              >
                {vipForm.cloud_storage_enabled
                  ? "ON · 已启用 VIP 留存策略"
                  : "OFF · 默认关闭（全量永久留存）"}
              </AdminStatusBadge>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <Cloud className="mt-0.5 size-4 shrink-0 text-[var(--admin-text)]" />
                  <div className="space-y-0.5">
                    <div className="text-[13px] font-semibold text-[var(--admin-text)]">
                      启用云存储付费会员制 (`cloud_storage_enabled`)
                    </div>
                    <p className="text-[12px] text-[var(--admin-text-muted)]">
                      切换后点击上方「保存更改」即时下发全站生效。
                    </p>
                  </div>
                </div>
                <Switch
                  checked={vipForm.cloud_storage_enabled}
                  disabled={loadingVip || savingVip || vipLoadError}
                  onCheckedChange={(checked) =>
                    setVipForm((prev) => ({
                      ...prev,
                      cloud_storage_enabled: checked,
                    }))
                  }
                  aria-label="切换云存储付费会员制总开关"
                />
              </div>

              {/* Status Callout */}
              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12px] leading-relaxed",
                  vipForm.cloud_storage_enabled
                    ? "border-emerald-500/30 bg-emerald-500/10 text-[var(--admin-text)]"
                    : "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-text-muted)]",
                )}
              >
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--admin-success)]" />
                <div>
                  {vipForm.cloud_storage_enabled ? (
                    <span>
                      <strong>当前状态：ON（商业化留存已开启）</strong> — 前台充值中心与图库自动展示{" "}
                      <code>¥9.9 / 30天</code> 云存储 VIP 续费入口与到期提醒徽章；后台清理任务严格执行「免费保留期 + VIP 到期宽限期 + 历史存量保护期」双重 7 天安全缓冲，绝不误删存量作品。
                    </span>
                  ) : (
                    <span>
                      <strong>当前状态：OFF（默认关闭）</strong> — 前台完全隐藏所有云存储 VIP 营销卡片与图片过期倒计时徽章，Cloudflare R2 与本地磁盘将永久保留所有用户生图作品，不执行非会员过期清理。
                    </span>
                  )}
                </div>
              </div>

              {/* Retention & Dual Buffer Numeric Inputs */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
                  <label
                    htmlFor="vip-free-retention-days"
                    className="block text-[12px] font-medium text-[var(--admin-text)]"
                  >
                    免费用户云端保留天数 (`free_retention_days`)
                  </label>
                  <Input
                    id="vip-free-retention-days"
                    type="number"
                    min={1}
                    max={3650}
                    disabled={loadingVip || savingVip || vipLoadError}
                    value={vipForm.free_retention_days ?? 3}
                    onChange={(event) =>
                      setVipForm((prev) => ({
                        ...prev,
                        free_retention_days: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      }))
                    }
                  />
                  <p className="text-[11px] text-[var(--admin-text-muted)]">
                    普通非 VIP 用户新生成作品的免费云端留存周期（默认 3 天）
                  </p>
                </div>

                <div className="space-y-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
                  <label
                    htmlFor="vip-grace-days"
                    className="block text-[12px] font-medium text-[var(--admin-text)]"
                  >
                    VIP 到期宽限缓冲期 (`vip_grace_days`)
                  </label>
                  <Input
                    id="vip-grace-days"
                    type="number"
                    min={1}
                    max={3650}
                    disabled={loadingVip || savingVip || vipLoadError}
                    value={vipForm.vip_grace_days ?? 7}
                    onChange={(event) =>
                      setVipForm((prev) => ({
                        ...prev,
                        vip_grace_days: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      }))
                    }
                  />
                  <p className="text-[11px] text-[var(--admin-text-muted)]">
                    会员过期后额外保留缓冲天数，续费即刻无损恢复（默认 7 天）
                  </p>
                </div>

                <div className="space-y-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
                  <label
                    htmlFor="vip-historical-grace-days"
                    className="block text-[12px] font-medium text-[var(--admin-text)]"
                  >
                    首次开启存量保护期 (`historical_grace_days`)
                  </label>
                  <Input
                    id="vip-historical-grace-days"
                    type="number"
                    min={1}
                    max={3650}
                    disabled={loadingVip || savingVip || vipLoadError}
                    value={vipForm.historical_grace_days ?? 7}
                    onChange={(event) =>
                      setVipForm((prev) => ({
                        ...prev,
                        historical_grace_days: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      }))
                    }
                  />
                  <p className="text-[11px] text-[var(--admin-text-muted)]">
                    首次将总开关切为 ON 时给予所有历史旧图的最低缓冲期（默认 7 天）
                  </p>
                </div>
              </div>
            </div>
          </AdminSectionCard>

          <MediaStorageCard />
        </div>
      ) : (
        <BackupSettingsCard />
      )}
    </AdminPageFrame>
  );
}
