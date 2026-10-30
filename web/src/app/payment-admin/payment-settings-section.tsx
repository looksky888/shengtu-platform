import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  fetchPaymentSettings,
  updatePaymentSettings,
  type PaymentSettings,
} from "@/lib/payment-admin-api";
import { useUnsavedRouteGuard } from "@/lib/use-unsaved-route-guard";

export function PaymentSettingsSection() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await fetchPaymentSettings();
      setSettings(result.item);
      setSavedSnapshot(JSON.stringify(result.item));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "加载业务规则失败";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(
    () => Boolean(settings && savedSnapshot && JSON.stringify(settings) !== savedSnapshot),
    [savedSnapshot, settings],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!settings) return false;
    setSaving(true);
    try {
      const result = await updatePaymentSettings(settings);
      setSettings(result.item);
      setSavedSnapshot(JSON.stringify(result.item));
      toast.success("支付业务规则已保存");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const discardChanges = useCallback(() => {
    if (!savedSnapshot) return;
    try {
      setSettings(JSON.parse(savedSnapshot) as PaymentSettings);
    } catch {
      void load();
    }
  }, [load, savedSnapshot]);

  const unsavedGuard = useUnsavedRouteGuard({
    when: isDirty && !saving,
    onSave: save,
    onDiscard: discardChanges,
  });

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        正在加载业务规则…
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-6 text-center">
        <AlertCircle className="size-7 text-status-danger" />
        <div>
          <h2 className="text-sm font-semibold text-status-danger">
            业务规则加载失败
          </h2>
          <p className="mt-1 text-xs text-status-danger/85">
            {loadError || "接口未返回有效配置"}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="size-3.5" />
          重新加载
        </Button>
      </div>
    );
  }

  const sample100PriceYuan = ((settings.credit_unit_price_fen * 100) / 100).toFixed(2);

  return (
    <>
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/70 bg-surface-muted/35">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <SlidersHorizontal className="size-4.5 text-muted-foreground" />
                充值业务规则
                <Badge
                  variant={settings.recharge_enabled ? "success" : "secondary"}
                  className="rounded-md"
                >
                  {settings.recharge_enabled ? "在线充值已开放" : "在线充值已关闭"}
                </Badge>
                {isDirty ? (
                  <Badge variant="warning" className="rounded-md">
                    未保存修改
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                控制前台充值中心开关、云存储权益购买权限及自定义积分计价边界。
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={saving}
            >
              <RefreshCw className="size-3.5" />
              刷新配置
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 pt-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border/75 bg-surface-muted/25 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  开放用户充值
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  允许普通用户在充值中心选购套餐并发起微信/支付宝扫码支付。
                </p>
              </div>
              <Switch
                checked={settings.recharge_enabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, recharge_enabled: checked })
                }
                aria-label="开放用户充值"
              />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border border-border/75 bg-surface-muted/25 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  开放云存储套餐
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  允许购买云端媒体持久化存储空间与到期续期权益。
                </p>
              </div>
              <Switch
                checked={settings.cloud_storage_enabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, cloud_storage_enabled: checked })
                }
                aria-label="开放云存储套餐"
              />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border border-border/75 bg-surface-muted/25 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  开放自定义积分充值
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  在固定套餐外，允许按单价输入任意合规积分数量下单。
                </p>
              </div>
              <Switch
                checked={settings.custom_credits_enabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, custom_credits_enabled: checked })
                }
                aria-label="开放自定义积分充值"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/75 bg-surface p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  自定义积分定价与限额
                </h3>
                <p className="text-xs text-muted-foreground">
                  当「开放自定义积分充值」开启时生效，金额以人民币「分」为单位精确结算。
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs tabular-nums">
                折算参考：100 积分 = ¥{sample100PriceYuan}
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-xs font-medium text-foreground">
                <span>每积分单价（分）</span>
                <Input
                  type="number"
                  min={1}
                  value={settings.credit_unit_price_fen}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      credit_unit_price_fen: Number(e.target.value),
                    })
                  }
                  className="h-9 rounded-lg font-mono tabular-nums"
                />
              </label>
              <label className="space-y-2 text-xs font-medium text-foreground">
                <span>单笔最少购买积分</span>
                <Input
                  type="number"
                  min={1}
                  value={settings.min_custom_credits}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      min_custom_credits: Number(e.target.value),
                    })
                  }
                  className="h-9 rounded-lg font-mono tabular-nums"
                />
              </label>
              <label className="space-y-2 text-xs font-medium text-foreground">
                <span>单笔最多购买积分</span>
                <Input
                  type="number"
                  min={settings.min_custom_credits}
                  value={settings.max_custom_credits}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      max_custom_credits: Number(e.target.value),
                    })
                  }
                  className="h-9 rounded-lg font-mono tabular-nums"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            {isDirty ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={discardChanges}
                disabled={saving}
              >
                <RotateCcw className="size-3.5" />
                还原修改
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || !isDirty}
              size="sm"
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {saving ? "保存中…" : "保存业务规则"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={unsavedGuard.isOpen}
        tone="warning"
        title="业务规则有未保存修改"
        description="离开当前页面后，未保存的充值业务规则修改将会丢失。"
        confirmLabel="保存并离开"
        pendingLabel="保存中…"
        cancelLabel="留在此页"
        pending={unsavedGuard.isSaving}
        secondaryAction={{
          label: "放弃修改并离开",
          variant: "outline",
          pending: unsavedGuard.isDiscarding,
          onClick: () => void unsavedGuard.confirmDiscardAndLeave(),
        }}
        onClose={unsavedGuard.cancelLeave}
        onConfirm={() => void unsavedGuard.confirmSaveAndLeave()}
      />
    </>
  );
}
