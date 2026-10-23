import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  XCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  PaymentChannel,
  PaymentStats,
  PaymentStatsPeriod,
} from "@/lib/payment-admin-api";

function money(value: number) {
  return `¥${(value / 100).toFixed(2)}`;
}
function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function PaymentStatsDashboard({
  stats,
  channels,
}: {
  stats: PaymentStats;
  channels: PaymentChannel[];
}) {
  const cards = [
    { label: "今日", data: stats.today },
    { label: "近 7 日", data: stats.last_7_days },
    { label: "本月", data: stats.current_month },
    { label: "累计", data: stats.all_time },
  ];
  const channelNames = new Map(
    channels.map((channel) => [
      channel.id,
      channel.provider === "alipay"
        ? "支付宝"
        : channel.provider === "wechatpay"
          ? "微信支付"
          : channel.name,
    ]),
  );
  const maxDailyAmount = Math.max(
    1,
    ...stats.daily_trend.map((item) => item.succeeded_amount_fen),
  );
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, data }, index) => (
          <StatsCard
            key={label}
            label={label}
            data={data}
            featured={index === 0}
          />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-muted-foreground" />近 7 日收入趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-2 border-b border-border/70 px-1 pt-3">
              {stats.daily_trend.map((item) => {
                const height = Math.max(
                  6,
                  (item.succeeded_amount_fen / maxDailyAmount) * 140,
                );
                return (
                  <div
                    key={item.date}
                    className="group flex min-w-0 flex-1 flex-col items-center gap-2"
                  >
                    <div className="relative flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t-md bg-foreground/80 transition-all group-hover:bg-foreground"
                        style={{ height: `${height}px` }}
                        title={`${item.date} ${money(item.succeeded_amount_fen)} · ${item.succeeded_orders} 笔`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {item.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="size-5 text-muted-foreground" />
              渠道表现
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.channel_breakdown.length === 0 ? (
              <EmptyState
                compact
                icon={CircleDollarSign}
                title="暂无交易数据"
                description="产生已支付订单后，各渠道的成交额与成功率将展示在此。"
              />
            ) : (
              stats.channel_breakdown.map((item) => (
                <div
                  key={item.channel_id}
                  className="rounded-xl border border-border/70 bg-background px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {channelNames.get(item.channel_id) || item.channel_id}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {item.succeeded_orders} / {item.total_orders} 笔成功
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="font-semibold">
                        {money(item.succeeded_amount_fen)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        成功率 {percent(item.success_rate)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full rounded-md bg-foreground"
                      style={{
                        width: `${Math.min(100, Math.max(0, item.success_rate))}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatsCard({
  label,
  data,
  featured,
}: {
  label: string;
  data: PaymentStatsPeriod;
  featured?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        {featured ? <span className="size-1.5 rounded-full bg-foreground" /> : null}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {money(data.succeeded_amount_fen)}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          成功 {data.succeeded_orders} 笔
        </span>
        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
          <XCircle className="size-3.5" />
          失败 {data.failed_orders} 笔
        </span>
        <span>关闭 {data.closed_orders} 笔</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>成功率 {percent(data.success_rate)}</span>
        <span>到账 {data.credited_credits} 积分</span>
      </div>
    </div>
  );
}
