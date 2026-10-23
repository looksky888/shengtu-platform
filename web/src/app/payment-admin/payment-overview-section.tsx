import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { PaymentStatsDashboard } from "@/app/payment-admin/payment-stats-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchPaymentChannels,
  fetchPaymentSettings,
  fetchPaymentStats,
  type PaymentChannel,
  type PaymentSettings,
  type PaymentStats,
} from "@/lib/payment-admin-api";

export function PaymentOverviewSection({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [statsResult, settingsResult, channelsResult] = await Promise.all([
        fetchPaymentStats(),
        fetchPaymentSettings().catch(() => ({ item: null })),
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

  if (loading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        正在汇总支付经营数据…
      </div>
    );
  }

  if (loadError || !stats) {
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

  const enabledChannelsCount = channels.filter((item) => item.enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/75 bg-card px-4 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">当前商业化状态：</span>
          {settings ? (
            <>
              <Badge
                variant={settings.recharge_enabled ? "success" : "secondary"}
                className="rounded-md"
              >
                {settings.recharge_enabled ? "在线充值已开放" : "在线充值未开放"}
              </Badge>
              <Badge variant="outline" className="rounded-md tabular-nums">
                活跃渠道 {enabledChannelsCount} / {channels.length}
              </Badge>
              {settings.custom_credits_enabled ? (
                <Badge variant="secondary" className="rounded-md font-mono tabular-nums">
                  自定义单价 ¥{(settings.credit_unit_price_fen / 100).toFixed(2)}/积分
                </Badge>
              ) : null}
            </>
          ) : (
            <Badge variant="secondary" className="rounded-md tabular-nums">
              活跃渠道 {enabledChannelsCount} / {channels.length}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={() => void load()}>
            <RefreshCw className="size-3.5" />
            刷新数据
          </Button>
          {onOpenSettings ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onOpenSettings}
            >
              <SlidersHorizontal className="size-3.5" />
              配置业务规则
              <ArrowRight className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <PaymentStatsDashboard stats={stats} channels={channels} />
    </div>
  );
}
