import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, RefreshCw, Sparkles, X } from "lucide-react";

import { MetricCard } from "./studio-stats-fab-parts";
import { formatCount } from "./studio-stats-fab-utils";
import type { StudioStatsFabState } from "./use-studio-stats-fab";

export function StudioStatsPanel({ fab }: { fab: StudioStatsFabState }) {
  const {
    open,
    setOpen,
    reduceMotion,
    stats,
    loading,
    error,
    elevatedFail,
    hasData,
    rateText,
    panelRef,
    panelStyle,
    setRefreshToken,
  } = fab;

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.button
            type="button"
            aria-label="关闭统计面板"
            className="fixed inset-0 z-[60] bg-slate-950/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            onClick={() => setOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            className="fixed z-[61]"
            style={{
              left: panelStyle.left,
              top: panelStyle.top,
              width: panelStyle.width,
              transformOrigin: panelStyle.transformOrigin,
            }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88, filter: "blur(8px)" }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.75 }}
            role="dialog"
            aria-label="今日生图统计"
          >
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(165deg,rgba(30,41,68,0.94),rgba(15,23,42,0.9))] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_180px_at_10%_0%,rgba(59,130,246,0.28),transparent_55%),radial-gradient(400px_160px_at_100%_0%,rgba(244,114,182,0.16),transparent_50%)]" />
              {!reduceMotion ? (
                <motion.div
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.08)_48%,transparent_62%)]"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
                />
              ) : null}

              <div className="relative flex items-start justify-between gap-3 px-4 pb-2.5 pt-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-sky-300" />
                    <h2 className="text-[15px] font-bold text-white">今日生图</h2>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{stats.rangeLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
                    实时账本
                  </span>
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-full text-slate-400 transition hover:bg-white/5 hover:text-white"
                    onClick={() => setOpen(false)}
                    aria-label="关闭"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>

              {loading && !hasData ? (
                <div className="relative flex min-h-28 items-center justify-center px-4 pb-6">
                  <LoaderCircle className="size-5 animate-spin text-slate-400" />
                </div>
              ) : error && !hasData ? (
                <div className="relative px-4 pb-5 text-center text-xs text-rose-300">{error}</div>
              ) : (
                <>
                  <div className="relative grid grid-cols-2 gap-2.5 px-3.5 pb-3">
                    <MetricCard
                      tone="ok"
                      label="成功图片"
                      value={stats.successImages}
                      hint={`成功任务 ${formatCount(stats.successTasks)} 个`}
                      animate={open && !reduceMotion}
                    />
                    <MetricCard
                      tone="bad"
                      label="失败图片"
                      value={stats.failedImages}
                      hint={`失败任务 ${formatCount(stats.failedTasks)} 个`}
                      animate={open && !reduceMotion}
                    />
                  </div>

                  <div className="relative mx-3.5 mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-2 flex items-baseline justify-between text-xs text-slate-400">
                      <span>成功率</span>
                      <strong className="text-lg font-extrabold tracking-tight text-indigo-100">{hasData ? rateText : "—"}</strong>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-400 shadow-[0_0_16px_rgba(59,130,246,0.55)]"
                        initial={{ width: 0 }}
                        animate={{ width: hasData ? `${Math.round(stats.successRate * 100)}%` : "0%" }}
                        transition={{ duration: reduceMotion ? 0 : 0.85, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>

                  {elevatedFail || stats.updatedAt ? (
                    <div className="relative mx-3.5 mb-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
                      {elevatedFail ? (
                        <span className="block text-rose-300/90">今日失败偏高，可检查提示词与上游可用性。</span>
                      ) : null}
                      {stats.updatedAt ? (
                        <span className={elevatedFail ? "mt-1 block text-slate-500" : "block text-slate-500"}>
                          更新于 {stats.updatedAt}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}

              <div className="relative flex items-center justify-between gap-2 border-t border-white/10 px-3.5 py-3">
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
                  onClick={() => setOpen(false)}
                >
                  收起
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(59,130,246,0.35)] transition hover:brightness-110 disabled:opacity-60"
                  onClick={() => setRefreshToken((value) => value + 1)}
                  disabled={loading}
                >
                  {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  刷新
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
