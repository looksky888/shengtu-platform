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
            <BarChart3 className="size-5 text-primary" />
            充值业务设置
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.recharge_enabled}
              onChange={(e) =>
                setSettings({ ...settings, recharge_enabled: e.target.checked })
              }
            />
            开放用户充值
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.custom_credits_enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  custom_credits_enabled: e.target.checked,
                })
              }
            />
            开放自定义积分
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={settings.cloud_storage_enabled} onChange={(e) => setSettings({ ...settings, cloud_storage_enabled: e.target.checked })} />
            开放云存储套餐
          </label>
          <label className="space-y-2 text-sm">
            每积分价格（分）
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
          <label className="space-y-2 text-sm">
            最少积分
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
          <label className="space-y-2 text-sm">
            最多积分
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
          <div className="flex items-end">
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
