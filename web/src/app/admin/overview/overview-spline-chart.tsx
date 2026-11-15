import { useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { buildClampedSplinePath } from "./overview-spline-math";

export type OverviewSplinePoint = {
  bucket?: string;
  label: string;
  requests: number;
  succeeded: number;
  failed: number;
  images?: number;
  videos?: number;
};

type SeriesKey = "requests" | "succeeded" | "failed";

const SERIES_META: ReadonlyArray<{
  key: SeriesKey;
  label: string;
  color: string;
}> = [
  { key: "requests", label: "生成请求", color: "var(--admin-chart-secondary)" },
  { key: "succeeded", label: "成功交付", color: "var(--admin-chart-primary)" },
  { key: "failed", label: "失败/拦截", color: "var(--admin-chart-warning)" },
];

export function OverviewSplineChart({
  points,
  title = "生成吞吐与交付趋势",
  subtitle,
}: {
  points: ReadonlyArray<OverviewSplinePoint>;
  title?: string;
  subtitle?: string;
}) {
  const gradientPrefix = useId().replace(/:/g, "");
  const sliceRefs = useRef<Array<SVGRectElement | null>>([]);
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    requests: true,
    succeeded: true,
    failed: true,
  });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.requests && !next.succeeded && !next.failed) {
        return prev;
      }
      return next;
    });
  };

  const width = 920;
  const height = 248;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baselineY = padTop + plotH;

  const { maxVal, yTicks, coords } = useMemo(() => {
    const safePoints =
      points.length > 0
        ? points
        : [{ label: "暂无", requests: 0, succeeded: 0, failed: 0 }];

    let rawMax = 0;
    for (const pt of safePoints) {
      if (visibleSeries.requests) rawMax = Math.max(rawMax, pt.requests);
      if (visibleSeries.succeeded) rawMax = Math.max(rawMax, pt.succeeded);
      if (visibleSeries.failed) rawMax = Math.max(rawMax, pt.failed);
    }
    const niceMax = rawMax <= 4 ? 4 : Math.ceil(rawMax / 4) * 4;
    const ticks = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax].map((v) =>
      Math.round(v),
    );

    const stepX = safePoints.length > 1 ? plotW / (safePoints.length - 1) : 0;
    const toY = (value: number) => {
      const clamped = Math.max(0, value);
      const ratio = niceMax > 0 ? Math.min(1, clamped / niceMax) : 0;
      return padTop + plotH * (1 - ratio);
    };

    const mapped = safePoints.map((pt, idx) => ({
      point: pt,
      x: safePoints.length > 1 ? padLeft + idx * stepX : padLeft + plotW / 2,
      requestsY: toY(pt.requests),
      succeededY: toY(pt.succeeded),
      failedY: toY(pt.failed),
    }));

    return { maxVal: niceMax, yTicks: ticks, coords: mapped };
  }, [padLeft, padTop, plotH, plotW, points, visibleSeries]);

  const seriesPaths = useMemo(() => {
    const buildFor = (selector: (item: (typeof coords)[number]) => number) => {
      const pts = coords.map((item) => ({ x: item.x, y: selector(item) }));
      const line = buildClampedSplinePath(pts, {
        minY: padTop,
        maxY: baselineY,
      });
      if (!line || pts.length === 0) return { line: "", area: "" };
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const area = `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
      return { line, area };
    };
    return {
      requests: buildFor((item) => item.requestsY),
      succeeded: buildFor((item) => item.succeededY),
      failed: buildFor((item) => item.failedY),
    };
  }, [baselineY, coords, padTop]);

  const activeCoord =
    activeIndex !== null && coords[activeIndex] ? coords[activeIndex]! : null;

  const moveFocusToSlice = (targetIdx: number) => {
    const bounded = Math.max(0, Math.min(coords.length - 1, targetIdx));
    setActiveIndex(bounded);
    sliceRefs.current[bounded]?.focus();
  };

  return (
    <section className="rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[var(--admin-text)]">{title}</div>
          {subtitle ? (
            <div className="text-[11.5px] text-[var(--admin-text-muted)]">{subtitle}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SERIES_META.map((series) => {
            const active = visibleSeries[series.key];
            return (
              <button
                key={series.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSeries(series.key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors",
                  active
                    ? "border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] text-[var(--admin-text)]"
                    : "border-transparent bg-transparent text-[var(--admin-text-subtle)] opacity-55 hover:opacity-85",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: series.color }}
                />
                <span>{series.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative px-3 pt-2 pb-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[248px] w-full select-none overflow-visible touch-manipulation"
          role="group"
          aria-label={title}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") {
              setActiveIndex(null);
            }
          }}
        >
          <defs>
            {SERIES_META.map((series) => (
              <linearGradient
                key={series.key}
                id={`${gradientPrefix}-${series.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={series.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={series.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
          </defs>

          {yTicks.map((tick, idx) => {
            const ratio = maxVal > 0 ? tick / maxVal : 0;
            const y = padTop + plotH * (1 - ratio);
            return (
              <g key={`${tick}-${idx}`}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="var(--admin-border)"
                  strokeDasharray={tick === 0 ? undefined : "3 3"}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-[var(--admin-text-subtle)] font-mono text-[10px]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {coords.map((item, idx) => {
            const showLabel =
              coords.length <= 10 ||
              idx === 0 ||
              idx === coords.length - 1 ||
              idx % Math.ceil(coords.length / 7) === 0;
            if (!showLabel) return null;
            return (
              <text
                key={`${item.point.label}-${idx}`}
                x={item.x}
                y={height - 7}
                textAnchor="middle"
                className="fill-[var(--admin-text-subtle)] font-mono text-[10px]"
              >
                {item.point.label}
              </text>
            );
          })}

          {SERIES_META.map((series) => {
            if (!visibleSeries[series.key]) return null;
            const paths = seriesPaths[series.key];
            if (!paths.line) return null;
            return (
              <g key={series.key}>
                <path
                  d={paths.area}
                  fill={`url(#${gradientPrefix}-${series.key})`}
                />
                <path
                  d={paths.line}
                  fill="none"
                  stroke={series.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {activeCoord ? (
            <g className="pointer-events-none">
              <line
                x1={activeCoord.x}
                x2={activeCoord.x}
                y1={padTop}
                y2={baselineY}
                stroke="var(--admin-border-strong)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {visibleSeries.requests ? (
                <circle
                  cx={activeCoord.x}
                  cy={activeCoord.requestsY}
                  r="4"
                  fill="var(--admin-chart-secondary)"
                  stroke="var(--admin-surface)"
                  strokeWidth="1.5"
                />
              ) : null}
              {visibleSeries.succeeded ? (
                <circle
                  cx={activeCoord.x}
                  cy={activeCoord.succeededY}
                  r="4"
                  fill="var(--admin-chart-primary)"
                  stroke="var(--admin-surface)"
                  strokeWidth="1.5"
                />
              ) : null}
              {visibleSeries.failed ? (
                <circle
                  cx={activeCoord.x}
                  cy={activeCoord.failedY}
                  r="4"
                  fill="var(--admin-chart-warning)"
                  stroke="var(--admin-surface)"
                  strokeWidth="1.5"
                />
              ) : null}
            </g>
          ) : null}

          {coords.map((item, idx) => {
            const rawSliceW = coords.length > 1 ? plotW / (coords.length - 1) : plotW;
            const rectX =
              coords.length > 1 ? Math.max(padLeft, item.x - rawSliceW / 2) : padLeft;
            const rectRight =
              coords.length > 1
                ? Math.min(width - padRight, item.x + rawSliceW / 2)
                : width - padRight;
            const sliceW = Math.max(8, rectRight - rectX);
            const sliceLabel = `${item.point.label}：生成请求 ${item.point.requests}，成功交付 ${item.point.succeeded}，失败 ${item.point.failed}`;

            return (
              <rect
                key={`hit-${idx}`}
                ref={(node) => {
                  sliceRefs.current[idx] = node;
                }}
                x={rectX}
                y={padTop}
                width={sliceW}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={sliceLabel}
                className="cursor-pointer outline-none focus-visible:stroke-[var(--admin-accent)] focus-visible:stroke-1"
                onPointerEnter={() => setActiveIndex(idx)}
                onPointerMove={() => setActiveIndex(idx)}
                onPointerDown={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onBlur={() =>
                  setActiveIndex((current) => (current === idx ? null : current))
                }
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveFocusToSlice(idx + 1);
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveFocusToSlice(idx - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    moveFocusToSlice(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    moveFocusToSlice(coords.length - 1);
                  } else if (event.key === "Escape") {
                    setActiveIndex(null);
                    event.currentTarget.blur();
                  }
                }}
              />
            );
          })}
        </svg>

        {activeCoord ? (
          <div
            className="pointer-events-none absolute top-3 z-10 min-w-[168px] rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-2 text-[11.5px]"
            style={{
              left:
                activeCoord.x > width * 0.65
                  ? "auto"
                  : `${Math.max(10, Math.round((activeCoord.x / width) * 100))}%`,
              right: activeCoord.x > width * 0.65 ? "16px" : "auto",
              boxShadow: "var(--admin-shadow-overlay)",
            }}
          >
            <div className="mb-1 flex items-center justify-between gap-3 font-mono font-semibold text-[var(--admin-text)]">
              <span>{activeCoord.point.label}</span>
              {activeCoord.point.bucket &&
              activeCoord.point.bucket !== activeCoord.point.label ? (
                <span className="text-[10px] font-normal text-[var(--admin-text-subtle)]">
                  {activeCoord.point.bucket}
                </span>
              ) : null}
            </div>
            <div className="space-y-0.5 tabular-nums">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[var(--admin-text-muted)]">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: "var(--admin-chart-secondary)" }}
                  />
                  生成请求
                </span>
                <span className="font-mono font-semibold text-[var(--admin-text)]">
                  {activeCoord.point.requests}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[var(--admin-text-muted)]">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: "var(--admin-chart-primary)" }}
                  />
                  成功交付
                </span>
                <span className="font-mono font-semibold text-[var(--admin-text)]">
                  {activeCoord.point.succeeded}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[var(--admin-text-muted)]">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: "var(--admin-chart-warning)" }}
                  />
                  失败/拦截
                </span>
                <span className="font-mono font-semibold text-[var(--admin-text)]">
                  {activeCoord.point.failed}
                </span>
              </div>
              {(activeCoord.point.images ?? 0) > 0 ||
              (activeCoord.point.videos ?? 0) > 0 ? (
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-[var(--admin-border)] pt-1 text-[10.5px] text-[var(--admin-text-muted)]">
                  <span>产出交付</span>
                  <span className="font-mono text-[var(--admin-text)]">
                    图 {activeCoord.point.images ?? 0} · 视 {activeCoord.point.videos ?? 0}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
