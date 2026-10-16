"use client";

import { useEffect, useRef } from "react";

import { usePageVisible } from "@/lib/use-page-visible";

import { useSettingsStore } from "./store";

export function SettingsDataController() {
  const hasRunningJobs = useSettingsStore((state) =>
    state.pools.some((pool) => {
      const status = pool.import_job?.status;
      return status === "pending" || status === "running";
    }),
  );
  const loadPools = useSettingsStore((state) => state.loadPools);
  const inFlightRef = useRef(false);
  const pageVisible = usePageVisible();

  useEffect(() => {
    if (!hasRunningJobs || !pageVisible) return;

    let disposed = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const poll = async () => {
      if (disposed || controller.signal.aborted || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await loadPools({ silent: true, signal: controller.signal });
      } finally {
        inFlightRef.current = false;
        if (!disposed && !controller.signal.aborted) {
          timer = window.setTimeout(() => void poll(), 1500);
        }
      }
    };

    void poll();
    return () => {
      disposed = true;
      inFlightRef.current = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [hasRunningJobs, loadPools, pageVisible]);

  return null;
}
