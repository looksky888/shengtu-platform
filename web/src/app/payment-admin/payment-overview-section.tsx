import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  LoaderCircle,
  RefreshCw,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { PaymentStatsDashboard } from "@/app/payment-admin/payment-stats-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchPaymentChannels,
  fetchPaymentSettings,
  fetchPaymentStats,
  updatePaymentSettings,
  type PaymentChannel,
  type PaymentSettings,
  type PaymentStats,
} from "@/lib/payment-admin-api";

export function PaymentOverviewSection() {
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [statsResult, settingsResult, channelsResult] = await Promise.all([
        fetchPaymentStats(),
        fetchPaymentSettings(),
        fetchPaymentChannels().catch(() => ({ items: [] as PaymentChannel[] })),
      ]);
      setStats(statsResult);
      setSettings(settingsResult.item);
      setChannels(channelsResult.items);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "加载支付概览失败";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await updatePaymentSettings(settings);
      setSettings(result.item);
      toast.success("支付业务设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    );
  if (loadError || !stats || !settings) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/10 px-6 text-center">
        <AlertCircle className="size-8 text-status-danger" />
        <div>
          <h2 className="font-semibold text-status-danger">经营概览加载失败</h2>
          <p className="mt-1 text-sm text-status-danger">
            {loadError || "接口未返回完整数据"}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          重新加载
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <PaymentStatsDashboard stats={stats} channels={channels} />
      <Card className="rounded-xl">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-muted-foreground" />
            充值业务设置
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5 sm:pt-5">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm transition-colors hover:bg-muted/35">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-border accent-foreground"
                checked={settings.recharge_enabled}
                onChange={(e) =>
                  setSettings({ ...settings, recharge_enabled: e.target.checked })
                }
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">开放用户充值</span>
                <span className="text-xs text-muted-foreground">
                  允许用户在充值中心发起在线支付订单
                </span>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm transition-colors hover:bg-muted/35">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-border accent-foreground"
                checked={settings.cloud_storage_enabled}
                onChange={(e) =>
                  setSettings({ ...settings, cloud_storage_enabled: e.target.checked })
                }
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">开放云存储套餐</span>
                <span className="text-xs text-muted-foreground">
                  允许购买云端存储空间与有效期权益
                </span>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm transition-colors hover:bg-muted/35">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-border accent-foreground"
                checked={settings.custom_credits_enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    custom_credits_enabled: e.target.checked,
                  })
                }
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">开放自定义积分</span>
                <span className="text-xs text-muted-foreground">
                  允许按单价自由输入购买积分数量
                </span>
              </div>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>每积分价格（分）</span>
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
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>最少积分</span>
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
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>最多积分</span>
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
              />
            </label>
          </div>
          <div className="flex items-center justify-end border-t border-border/60 pt-4">
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="h-9 rounded-lg"
            >
              <Save className="size-4" />
              {saving ? "保存中…" : "保存设置"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
