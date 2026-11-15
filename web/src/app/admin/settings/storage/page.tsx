"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cloud, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { MediaStorageCard } from "@/app/settings/components/media-storage-card";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsSwitchRow,
  SettingsUnitInput,
} from "@/app/settings/components/settings-ui";
import { useRegisterSettingsDirty } from "@/app/settings/settings-dirty-registry-hooks";
import { SETTINGS_TAB_REFRESH_EVENT } from "@/app/settings/settings-tab-types";
import { useSettingsStore } from "@/app/settings/store";
import { useEnsureSettingsConfigLoaded } from "@/app/settings/use-ensure-settings-config";
import {
  AdminPageFrame,
  AdminStatTile,
  AdminStatusBadge,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  fetchPaymentSettings,
  updatePaymentSettings,
  type PaymentSettings,
} from "@/lib/payment-admin-api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

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

type VipDayKey =
  | "free_retention_days"
  | "vip_grace_days"
  | "historical_grace_days";

const VIP_DAY_META: readonly {
  key: VipDayKey;
  label: string;
  fallback: number;
}[] = [
  { key: "free_retention_days", label: "免费用户云端保留天数", fallback: 3 },
  { key: "vip_grace_days", label: "VIP 到期宽限缓冲期", fallback: 7 },
  { key: "historical_grace_days", label: "首次开启存量保护期", fallback: 7 },
];

function normalizeVipFields(item: PaymentSettings): PaymentSettings {
  return {
    ...item,
    cloud_storage_enabled: Boolean(item.cloud_storage_enabled),
    free_retention_days: Math.max(1, Number(item.free_retention_days) || 3),
    vip_grace_days: Math.max(1, Number(item.vip_grace_days) || 7),
    historical_grace_days: Math.max(1, Number(item.historical_grace_days) || 7),
  };
}

function getVipDayErrors(
  vipForm: PaymentSettings,
  vipDrafts: Partial<Record<VipDayKey, string>>,
): Partial<Record<VipDayKey, string>> {
  const errors: Partial<Record<VipDayKey, string>> = {};
  for (const { key, label, fallback } of VIP_DAY_META) {
    const raw =
      key in vipDrafts
        ? vipDrafts[key] ?? ""
        : String(vipForm[key] ?? fallback);
    const trimmed = raw.trim();
    const num = trimmed === "" ? Number.NaN : Number(trimmed);
    if (!Number.isInteger(num) || num < 1 || num > 3650) {
      errors[key] = `${label}需为 1–3650 之间的整数`;
    }
  }
  return errors;
}

export default function AdminStorageSettingsPage({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const { isCheckingAuth, session } = useAuthGuard(
    undefined,
    embedded ? "/settings" : "/admin/settings/storage",
  );

  const config = useSettingsStore((state) => state.config);

  useEnsureSettingsConfigLoaded(Boolean(session));

  const [vipForm, setVipForm] = useState<PaymentSettings>(
    DEFAULT_PAYMENT_VIP_SETTINGS,
  );
  const [vipBaseline, setVipBaseline] = useState<PaymentSettings>(
    DEFAULT_PAYMENT_VIP_SETTINGS,
  );
  const [vipDrafts, setVipDrafts] = useState<Partial<Record<VipDayKey, string>>>(
    {},
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
      setVipDrafts({});
      setVipLoadError(false);
    } catch (error) {
      setVipLoadError(true);
      if (!silent) {
        toast.error(
          error instanceof Error
            ? error.message
            : "读取云存储会员留存配置失败",
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

  useEffect(() => {
    if (!session) return;
    const handleTabRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (!detail?.tab || detail.tab === "media" || detail.tab === "storage") {
        void loadVipSettings(true);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
  }, [loadVipSettings, session]);

  const updateVipDay = (key: VipDayKey, raw: string) => {
    setVipDrafts((prev) => ({ ...prev, [key]: raw }));
    const trimmed = raw.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed)) {
        setVipForm((prev) => ({ ...prev, [key]: parsed }));
      }
    }
  };

  const normalizeVipDayOnBlur = (key: VipDayKey, fallback: number) => {
    if (!(key in vipDrafts)) return;
    const raw = (vipDrafts[key] ?? "").trim();
    if (!raw) {
      const restored = Math.max(1, Number(vipBaseline[key]) || fallback);
      setVipForm((prev) => ({ ...prev, [key]: restored }));
      setVipDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    if (/^-?\d+$/.test(raw)) {
      const parsed = Number(raw);
      if (Number.isSafeInteger(parsed)) {
        setVipForm((prev) => ({ ...prev, [key]: parsed }));
        setVipDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  };

  const getVipDayDisplay = (key: VipDayKey, fallback: number): string | number =>
    key in vipDrafts ? (vipDrafts[key] ?? "") : (vipForm[key] ?? fallback);

  const vipErrors = useMemo(
    () => getVipDayErrors(vipForm, vipDrafts),
    [vipDrafts, vipForm],
  );
  const hasVipValidationError = Object.keys(vipErrors).length > 0;

  const vipDirty = useMemo(() => {
    const readVal = (key: VipDayKey, fallback: number) =>
      key in vipDrafts
        ? (vipDrafts[key] ?? "").trim()
        : String(vipForm[key] ?? fallback);
    return (
      vipForm.cloud_storage_enabled !== vipBaseline.cloud_storage_enabled ||
      readVal("free_retention_days", 3) !==
        String(vipBaseline.free_retention_days ?? 3) ||
      readVal("vip_grace_days", 7) !==
        String(vipBaseline.vip_grace_days ?? 7) ||
      readVal("historical_grace_days", 7) !==
        String(vipBaseline.historical_grace_days ?? 7)
    );
  }, [vipBaseline, vipDrafts, vipForm]);

  const validateVipSettings = useCallback(() => {
    if (vipLoadError) {
      toast.error(
        "云存储会员留存配置尚未成功加载，已禁止覆盖保存，请先点击重试",
      );
      return false;
    }
    const currentErrors = getVipDayErrors(vipForm, vipDrafts);
    const firstMsg = Object.values(currentErrors)[0];
    if (firstMsg) {
      toast.error(firstMsg);
      return false;
    }
    return true;
  }, [vipDrafts, vipForm, vipLoadError]);

  const handleSaveVipSettings = useCallback(async (): Promise<boolean> => {
    if (!validateVipSettings()) return false;

    const resolveDays = (key: VipDayKey, fallback: number) => {
      const raw =
        key in vipDrafts
          ? (vipDrafts[key] ?? "").trim()
          : String(vipForm[key] ?? fallback);
      return Math.max(1, Math.min(3650, Number(raw) || fallback));
    };

    const freeDays = resolveDays("free_retention_days", 3);
    const vipGrace = resolveDays("vip_grace_days", 7);
    const histGrace = resolveDays("historical_grace_days", 7);

    setSavingVip(true);
    try {
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
      setVipDrafts({});
      setVipLoadError(false);
      toast.success(
        saved.cloud_storage_enabled
          ? "已启用云存储会员留存策略"
          : "已关闭云存储会员制，云端与本地媒体恢复永久留存",
      );
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "保存云存储留存策略失败",
      );
      return false;
    } finally {
      setSavingVip(false);
    }
  }, [validateVipSettings, vipDrafts, vipForm]);

  const handleDiscardVipSettings = useCallback(() => {
    setVipForm(vipBaseline);
    setVipDrafts({});
    return true;
  }, [vipBaseline]);

  useRegisterSettingsDirty({
    id: "admin-page-storage-vip",
    tab: "media",
    label: "云存储会员留存策略",
    isDirty: vipDirty && !vipLoadError,
    validate: validateVipSettings,
    save: handleSaveVipSettings,
    discard: handleDiscardVipSettings,
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
      : "本地磁盘存储";

  return (
    <AdminPageFrame
      embedded={embedded}
      groupLabel="系统配置"
      title="媒体存储"
      description="统一管理云存储付费会员制（VIP 留存策略）总开关、Cloudflare R2 对象存储后端与历史媒体平滑迁移。"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="云存储会员留存模式"
          value={
            vipForm.cloud_storage_enabled
              ? "已启用 · 商业化留存"
              : "未启用 · 永久留存"
          }
          tone={vipForm.cloud_storage_enabled ? "success" : "default"}
          hint={
            vipForm.cloud_storage_enabled
              ? "前台开启云存储会员订阅入口与到期缓冲回收"
              : "前台隐藏所有会员到期提示，所有作品永久保留"
          }
        />
        <AdminStatTile
          label="当前媒体存储引擎"
          value={providerLabel}
          tone={config?.media_storage_provider === "r2" ? "info" : "default"}
          hint={
            config?.media_storage_provider === "r2"
              ? `存储桶：${config?.media_r2_bucket || "未命名"}`
              : "存储于服务端本地数据目录"
          }
        />
        <AdminStatTile
          label="免费留存 / 双重缓冲期"
          value={`${vipForm.free_retention_days ?? 3} 天 / ${vipForm.vip_grace_days ?? 7} 天 / ${vipForm.historical_grace_days ?? 7} 天`}
          hint="免费保留天数 · 会员宽限期 · 历史存量保护期"
        />
      </div>

      <div className="space-y-5">
        {vipLoadError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-[var(--admin-text)]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--admin-warning)]" />
              <span>
                未能读取当前线上支付与云存储配置，系统已暂时锁定下方会员留存设置保存，避免覆盖线上其他支付参数。
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingVip}
              onClick={() => void loadVipSettings()}
            >
              <RefreshCw
                className={cn("size-3.5", loadingVip && "animate-spin")}
              />
              重试读取
            </Button>
          </div>
        ) : null}

        <div id="settings-section-media-vip">
          <SettingsCard
            icon={Cloud}
            title="云存储付费会员制（VIP 留存策略）"
            description="控制是否启用云端画廊阶梯留存、到期提醒徽章与云存储会员订阅能力"
            meta={
              <AdminStatusBadge
                tone={vipForm.cloud_storage_enabled ? "success" : "neutral"}
              >
                {vipForm.cloud_storage_enabled
                  ? "已启用 VIP 留存策略"
                  : "未启用（全量永久留存）"}
              </AdminStatusBadge>
            }
            footer={
              <SettingsCardSaveFooter
                dirty={vipDirty && !vipLoadError}
                saving={savingVip}
                disabled={loadingVip || vipLoadError}
                saveLabel="保存会员留存策略"
                hint={
                  vipLoadError
                    ? "当前配置读取失败，请先点击上方重试读取"
                    : hasVipValidationError
                      ? "请先修正标红的保留或缓冲天数（1–3650 天整数）"
                      : undefined
                }
                onReset={handleDiscardVipSettings}
                onSave={() => void handleSaveVipSettings()}
              />
            }
          >
            <div className="space-y-4">
              <SettingsSwitchRow
                id="vip-cloud-storage-enabled"
                title="启用云存储付费会员制"
                description="开启后前台展示云存储会员续费入口与作品留存倒计时；关闭后全站隐藏会员提示并永久保留作品"
                checked={vipForm.cloud_storage_enabled}
                disabled={loadingVip || savingVip || vipLoadError}
                onCheckedChange={(checked) =>
                  setVipForm((prev) => ({
                    ...prev,
                    cloud_storage_enabled: checked,
                  }))
                }
              />

              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-5",
                  vipForm.cloud_storage_enabled
                    ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
                    : "border-border/75 bg-surface-subtle/50 text-muted-foreground",
                )}
              >
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-success" />
                <div>
                  {vipForm.cloud_storage_enabled ? (
                    <span>
                      <strong>当前状态：商业化留存已开启</strong> — 前台充值中心与图库自动展示云存储会员续费入口与到期提醒徽章；后台清理任务严格执行「免费保留期 + 会员到期宽限期 + 历史存量保护期」双重安全缓冲，绝不误删存量作品。
                    </span>
                  ) : (
                    <span>
                      <strong>当前状态：默认关闭（永久留存）</strong> — 前台完全隐藏云存储会员卡片与图片过期倒计时徽章，Cloudflare R2 与本地磁盘将永久保留所有用户生图作品，不执行非会员过期清理。
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-3">
                <SettingsUnitInput
                  id="vip-free-retention-days"
                  label="免费用户云端保留天数"
                  unit="天"
                  min={1}
                  max={3650}
                  rangeHint="1–3650"
                  disabled={loadingVip || savingVip || vipLoadError}
                  value={getVipDayDisplay("free_retention_days", 3)}
                  error={vipErrors.free_retention_days}
                  description="普通非会员用户新生成作品的免费云端留存周期（默认 3 天）"
                  onChange={(value) =>
                    updateVipDay("free_retention_days", value)
                  }
                  onBlur={() =>
                    normalizeVipDayOnBlur("free_retention_days", 3)
                  }
                />

                <SettingsUnitInput
                  id="vip-grace-days"
                  label="会员到期宽限缓冲期"
                  unit="天"
                  min={1}
                  max={3650}
                  rangeHint="1–3650"
                  disabled={loadingVip || savingVip || vipLoadError}
                  value={getVipDayDisplay("vip_grace_days", 7)}
                  error={vipErrors.vip_grace_days}
                  description="会员过期后额外保留缓冲天数，期间续费可无损恢复（默认 7 天）"
                  onChange={(value) => updateVipDay("vip_grace_days", value)}
                  onBlur={() => normalizeVipDayOnBlur("vip_grace_days", 7)}
                />

                <SettingsUnitInput
                  id="vip-historical-grace-days"
                  label="首次开启存量保护期"
                  unit="天"
                  min={1}
                  max={3650}
                  rangeHint="1–3650"
                  disabled={loadingVip || savingVip || vipLoadError}
                  value={getVipDayDisplay("historical_grace_days", 7)}
                  error={vipErrors.historical_grace_days}
                  description="首次开启会员留存策略时给予所有历史旧图的最低保护期（默认 7 天）"
                  onChange={(value) =>
                    updateVipDay("historical_grace_days", value)
                  }
                  onBlur={() =>
                    normalizeVipDayOnBlur("historical_grace_days", 7)
                  }
                />
              </div>
            </div>
          </SettingsCard>
        </div>

        <div id="settings-section-media-r2">
          <MediaStorageCard />
        </div>
      </div>
    </AdminPageFrame>
  );
}
