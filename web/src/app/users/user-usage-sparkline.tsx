import { useMemo } from "react";

import {
  formatCompactNumber,
  formatUsageDate,
  normalizeUsageCurve,
  type NormalizedUsagePoint,
} from "@/app/users/users-utils";
import type { ManagedUserUsage } from "@/lib/api";

export function UserUsageSparkline({ points }: { points?: ManagedUserUsage["usage_curve"] }) {
  const safePoints = useMemo(() => normalizeUsageCurve(points), [points]);

  if (safePoints.length === 0) {
    return (
      <div
        className="flex h-16 w-[230px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground"
        aria-label="调用曲线暂无数据"
      >
        暂无调用
      </div>
    );
  }

  const width = 220;
  const height = 64;
  const paddingX = 8;
  const paddingTop = 8;
  const paddingBottom = 12;
  const baselineY = height - paddingBottom;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;
  const calls = safePoints.map((point) => point.calls);
  const maxCalls = Math.max(...calls);
  const minCalls = Math.min(...calls);
  const hasVariation = maxCalls > minCalls;
  const valueRange = Math.max(1, maxCalls - minCalls);
  const chartPoints = safePoints.map((point, index) => {
    const x = safePoints.length === 1 ? width / 2 : paddingX + (index / (safePoints.length - 1)) * plotWidth;
    const y = hasVariation
      ? paddingTop + ((maxCalls - point.calls) / valueRange) * plotHeight
      : flatY(maxCalls, baselineY, paddingTop, plotHeight);
    return { point, x, y };
  });
  const firstPoint = chartPoints[0];
  const lastPoint = chartPoints[chartPoints.length - 1];
  const linePath = chartPoints.length === 1
    ? `M ${firstPoint.x - 12} ${firstPoint.y} L ${firstPoint.x + 12} ${firstPoint.y}`
    : chartPoints.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const areaPath = chartPoints.length === 1
    ? `M ${firstPoint.x - 12} ${baselineY} L ${firstPoint.x - 12} ${firstPoint.y} L ${firstPoint.x + 12} ${firstPoint.y} L ${firstPoint.x + 12} ${baselineY} Z`
    : `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
  const peakPoint = safePoints.reduce((peak, point) => (point.calls > peak.calls ? point : peak), safePoints[0]);
  const latestPoint = lastPoint.point;
  const label = `近 ${safePoints.length} 日调用曲线，今日 ${latestPoint.calls} 次，峰值 ${peakPoint.calls} 次`;

  return (
    <div className="w-[230px] space-y-1.5" aria-label={label}>
      <div className="h-16 overflow-hidden rounded-lg border border-border/70 bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" className="h-full w-full">
          <title>{label}</title>
          <line x1={paddingX} x2={width - paddingX} y1={paddingTop} y2={paddingTop} className="stroke-border/70" strokeDasharray="3 5" />
          <line x1={paddingX} x2={width - paddingX} y1={baselineY} y2={baselineY} className="stroke-border/70" />
          <path d={areaPath} className="fill-[#3b82f6] opacity-10 dark:opacity-15" />
          <path d={linePath} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" className="text-[#1456f0] dark:text-sky-300" />
          {chartPoints.map(({ point, x, y }, index) => <UsagePointCircle key={point.date} point={point} x={x} y={y} isLatest={index === chartPoints.length - 1} />)}
        </svg>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] leading-4 text-muted-foreground">
        <span>{formatUsageDate(safePoints[0].date)}-{formatUsageDate(latestPoint.date)}</span>
        <span>峰值 {formatCompactNumber(peakPoint.calls)}</span>
      </div>
    </div>
  );
}

function flatY(maxCalls: number, baselineY: number, paddingTop: number, plotHeight: number) {
  return maxCalls === 0 ? baselineY : paddingTop + plotHeight / 2;
}

function UsagePointCircle({ point, x, y, isLatest }: { point: NormalizedUsagePoint; x: number; y: number; isLatest: boolean }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={isLatest ? 3.4 : 2.4}
      className={isLatest ? "fill-[#1456f0] dark:fill-sky-300" : "fill-background stroke-[#1456f0] dark:stroke-sky-300"}
      strokeWidth={isLatest ? 0 : 1.6}
    >
      <title>{`${point.date} 调用 ${point.calls} 次，成功 ${point.success} 次，失败 ${point.failure} 次，额度 ${point.quotaUsed}`}</title>
    </circle>
  );
}