"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  fetchMediaMigrationStatus,
  fetchMediaLocalCleanupStatus,
  fetchMediaStorageOverview,
  testMediaStorageConnection,
  triggerMediaMigration,
  triggerMediaLocalCleanup,
  type MediaLocalCleanupStatus,
  type MediaMigrationStatus,
  type MediaStorageHealth,
  type SettingsConfig,
} from "@/lib/api";

const idleMigration: MediaMigrationStatus = {
  state: "idle",
  total: 0,
  processed: 0,
  migrated: 0,
  skipped: 0,
  pending: 0,
  failed: 0,
};
const idleCleanup: MediaLocalCleanupStatus = {
  state: "idle", mode: "verify", total: 0, processed: 0, eligible: 0, verified: 0,
  skipped: 0, failed: 0, removed_files: 0, reclaimable_bytes: 0, freed_bytes: 0,
};

export function useMediaStorage(config: SettingsConfig | null) {
  const [health, setHealth] = useState<MediaStorageHealth | null>(null);
  const [migration, setMigration] = useState<MediaMigrationStatus>(idleMigration);
  const [cleanup, setCleanup] = useState<MediaLocalCleanupStatus>(idleCleanup);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStartingCleanup, setIsStartingCleanup] = useState(false);
  const [activeProvider, setActiveProvider] = useState<"local" | "r2">("local");

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchMediaStorageOverview({ signal });
    setHealth(data.health);
    setMigration(data.migration);
    setCleanup(data.cleanup);
    setActiveProvider(data.active_provider);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    loadOverview(controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : "加载媒体存储状态失败");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [loadOverview]);

  useEffect(() => {
    if (migration.state !== "running" && cleanup.state !== "running") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        if (migration.state === "running") {
          const data = await fetchMediaMigrationStatus({ signal: controller.signal });
          setMigration(data.migration);
        } else {
          const data = await fetchMediaLocalCleanupStatus({ signal: controller.signal });
          setCleanup(data.cleanup);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : "刷新媒体任务进度失败");
        }
      }
    }, 1500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [cleanup.state, migration.state]);

  const testConnection = async () => {
    if (!config) return;
    setIsTesting(true);
    try {
      const data = await testMediaStorageConnection({
        account_id: String(config.media_r2_account_id || "").trim(),
        access_key_id: String(config.media_r2_access_key_id || "").trim(),
        secret_access_key: String(config.media_r2_secret_access_key || "").trim() || undefined,
        bucket: String(config.media_r2_bucket || "").trim(),
      });
      setHealth(data.health);
      if (data.health.status === "ok") toast.success("R2 连接正常");
      else toast.error(data.health.error || "R2 连接失败");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "R2 连接测试失败");
    } finally {
      setIsTesting(false);
    }
  };

  const startMigration = async (saveConfig: () => Promise<boolean>) => {
    setIsStarting(true);
    try {
      if (!(await saveConfig())) return;
      const data = await triggerMediaMigration();
      setMigration(data.migration);
      toast.success(data.migration.state === "running" ? "旧图片迁移已开始" : "迁移任务已存在");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动迁移失败");
    } finally {
      setIsStarting(false);
    }
  };

  const startCleanup = async (mode: "verify" | "delete") => {
    setIsStartingCleanup(true);
    try {
      const data = await triggerMediaLocalCleanup(mode, mode === "delete" ? cleanup.confirmation_token || "" : "");
      setCleanup(data.cleanup);
      toast.success(mode === "verify" ? "R2 副本验证已开始" : "已验证本地副本清理已开始");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动本地副本任务失败");
    } finally {
      setIsStartingCleanup(false);
    }
  };

  return { health, migration, cleanup, activeProvider, isLoading, isTesting, isStarting, isStartingCleanup, testConnection, startMigration, startCleanup };
}
