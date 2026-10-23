"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  fetchMediaLocalCleanupStatus,
  fetchMediaMigrationStatus,
  fetchMediaStorageOverview,
  testMediaStorageConnection,
  triggerMediaLocalCleanup,
  triggerMediaMigration,
  type MediaLocalCleanupStatus,
  type MediaMigrationStatus,
  type MediaStorageHealth,
  type SettingsConfig,
} from "@/lib/api";

import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";

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
  state: "idle",
  mode: "verify",
  total: 0,
  processed: 0,
  eligible: 0,
  verified: 0,
  skipped: 0,
  failed: 0,
  removed_files: 0,
  reclaimable_bytes: 0,
  freed_bytes: 0,
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

  const reloadOverview = useCallback(
    async (options: { signal?: AbortSignal; silent?: boolean } = {}) => {
      const { signal, silent = false } = options;
      if (!silent) setIsLoading(true);
      try {
        const data = await fetchMediaStorageOverview({ signal });
        if (signal?.aborted) return;
        setHealth(data.health);
        setMigration(data.migration);
        setCleanup(data.cleanup);
        setActiveProvider(data.active_provider);
      } catch (error) {
        if (!signal?.aborted) {
          toast.error(
            error instanceof Error ? error.message : "加载媒体存储状态失败"
          );
        }
      } finally {
        if (!signal?.aborted && !silent) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    void reloadOverview({ signal: controller.signal });
    return () => controller.abort();
  }, [reloadOverview]);

  useEffect(() => {
    const handleTabRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab === "storage") {
        void reloadOverview({ silent: true });
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
  }, [reloadOverview]);

  useEffect(() => {
    const isMigrationRunning = migration.state === "running";
    const isCleanupRunning = cleanup.state === "running";
    if (!isMigrationRunning && !isCleanupRunning) return;

    let disposed = false;
    let timer = 0;
    const controller = new AbortController();

    const poll = async () => {
      let keepPolling = false;
      try {
        if (isMigrationRunning) {
          const data = await fetchMediaMigrationStatus({
            signal: controller.signal,
          });
          if (disposed || controller.signal.aborted) return;
          setMigration(data.migration);
          keepPolling = data.migration.state === "running";
        } else {
          const data = await fetchMediaLocalCleanupStatus({
            signal: controller.signal,
          });
          if (disposed || controller.signal.aborted) return;
          setCleanup(data.cleanup);
          keepPolling = data.cleanup.state === "running";
        }
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          toast.error(
            error instanceof Error ? error.message : "刷新媒体任务进度失败"
          );
          keepPolling = true;
        }
      } finally {
        if (!disposed && !controller.signal.aborted && keepPolling) {
          timer = window.setTimeout(() => {
            void poll();
          }, 1500);
        }
      }
    };

    timer = window.setTimeout(() => {
      void poll();
    }, 1500);

    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [cleanup.state, migration.state]);

  const testConnection = async () => {
    if (!config) return;
    const accountId = String(config.media_r2_account_id || "").trim();
    const accessKeyId = String(config.media_r2_access_key_id || "").trim();
    const secretAccessKey = String(config.media_r2_secret_access_key || "").trim();
    const bucket = String(config.media_r2_bucket || "").trim();

    if (!accountId || !accessKeyId || !bucket) {
      toast.error("请先填写完整的 R2 Account ID、Access Key ID 与 Bucket");
      return;
    }
    if (!secretAccessKey && !config.media_r2_secret_access_key_configured) {
      toast.error("首次探测连接请先填写 R2 Secret Access Key");
      return;
    }

    setIsTesting(true);
    try {
      const data = await testMediaStorageConnection({
        account_id: accountId,
        access_key_id: accessKeyId,
        secret_access_key: secretAccessKey || undefined,
        bucket,
      });
      setHealth(data.health);
      if (data.health.status === "ok") {
        toast.success("Cloudflare R2 连接正常");
      } else {
        toast.error(data.health.error || "Cloudflare R2 连接失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "R2 连接测试失败");
    } finally {
      setIsTesting(false);
    }
  };

  const startMigration = async (beforeStart?: () => Promise<boolean>) => {
    setIsStarting(true);
    try {
      if (beforeStart && !(await beforeStart())) return;
      const data = await triggerMediaMigration();
      setMigration(data.migration);
      toast.success(
        data.migration.state === "running"
          ? "存量媒体迁移已启动"
          : "迁移任务已在运行中"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动存量媒体迁移失败");
    } finally {
      setIsStarting(false);
    }
  };

  const startCleanup = async (mode: "verify" | "delete") => {
    setIsStartingCleanup(true);
    try {
      const data = await triggerMediaLocalCleanup(
        mode,
        mode === "delete" ? cleanup.confirmation_token || "" : ""
      );
      setCleanup(data.cleanup);
      toast.success(
        mode === "verify"
          ? "R2 对象完整性校验已开始"
          : "已迁移本地缓存清理已开始"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动本地缓存任务失败");
    } finally {
      setIsStartingCleanup(false);
    }
  };

  return {
    health,
    migration,
    cleanup,
    activeProvider,
    isLoading,
    isTesting,
    isStarting,
    isStartingCleanup,
    reloadOverview,
    testConnection,
    startMigration,
    startCleanup,
  };
}
