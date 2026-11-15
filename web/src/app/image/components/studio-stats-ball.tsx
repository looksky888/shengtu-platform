import { motion } from "motion/react";

import { cn } from "@/lib/utils";

import { ProgressRing } from "./studio-stats-fab-parts";
import type { StudioStatsFabState } from "./use-studio-stats-fab";

const BALL = 64;

export function StudioStatsBall({ fab }: { fab: StudioStatsFabState }) {
  const {
    open,
    reduceMotion,
    stats,
    loading,
    elevatedFail,
    hasData,
    rateText,
    ballCountText,
    bump,
    wrapRef,
    springX,
    springY,
    pos,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
  } = fab;

  return (
    <motion.div
      ref={wrapRef}
      className="fixed z-[62]"
      style={{
        width: BALL,
        height: BALL,
        left: 0,
        top: 0,
        x: reduceMotion ? pos.x : springX,
        y: reduceMotion ? pos.y : springY,
      }}
    >
      <motion.button
        type="button"
        aria-label={
          open
            ? "关闭今日生图统计"
            : hasData
              ? `今日成功 ${stats.successImages} 张，成功率 ${rateText}`
              : "打开今日生图统计"
        }
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        whileHover={reduceMotion ? undefined : { scale: 1.05 }}
        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        animate={
          reduceMotion
            ? undefined
            : open
              ? { scale: 1.08 }
              : bump > 0
                ? { scale: [1, 1.12, 1] }
                : { scale: 1 }
        }
        transition={bump > 0 && !open ? { duration: 0.35 } : undefined}
        className="relative size-full cursor-grab touch-none rounded-full border-0 bg-transparent p-0 outline-none active:cursor-grabbing"
      >
        {elevatedFail && !reduceMotion ? (
          <span className="pointer-events-none absolute -inset-2 animate-pulse rounded-full border border-rose-400/50 opacity-70" />
        ) : null}

        <span className="pointer-events-none absolute -inset-[3px] overflow-hidden rounded-full">
          <span
            className={cn(
              "absolute inset-0 rounded-full",
              elevatedFail
                ? "bg-[conic-gradient(from_0deg,#f43f5e,#fb7185,#f97316,#f43f5e)]"
                : "bg-[conic-gradient(from_0deg,#3b82f6,#22d3ee,#a78bfa,#f472b6,#3b82f6)]",
              !reduceMotion && "animate-[spin_4.5s_linear_infinite]",
            )}
          />
          <span className="absolute inset-[2.5px] rounded-full bg-slate-950" />
        </span>

        <span
          className={cn(
            "absolute inset-[3px] overflow-hidden rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_30px_rgba(37,99,235,0.45)]",
            elevatedFail
              ? "bg-[linear-gradient(145deg,#e11d48_0%,#be123c_45%,#f97316_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_30px_rgba(225,29,72,0.4)]"
              : "bg-[linear-gradient(145deg,#2563eb_0%,#4f46e5_45%,#0ea5e9_100%)]",
          )}
        >
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.35),transparent_40%)]" />
          <ProgressRing rate={hasData ? stats.successRate : 0} />
          <span className="relative z-[1] grid h-full place-items-center text-center leading-none text-white">
            <span>
              <span
                className={cn(
                  "block font-extrabold tracking-tight drop-shadow tabular-nums",
                  ballCountText.length >= 4 ? "text-[12px]" : "text-[15px]",
                )}
              >
                {loading && !hasData ? "…" : hasData || stats.successImages > 0 ? ballCountText : "—"}
              </span>
              <span className="mt-0.5 block text-[9px] font-semibold tracking-wide opacity-85">
                {hasData ? rateText : "今日"}
              </span>
            </span>
          </span>
        </span>
      </motion.button>
    </motion.div>
  );
}
