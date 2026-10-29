"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  fetchBackupConfig,
  fetchBackupRunStatus,
  runBackup,
  updateBackupConfig,
  type BackupConfig,
  type BackupState,
} from "@/lib/api";
import { usePageVisible } from "@/lib/use-page-visible";

import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";

export type BackupFormState = {
  enabled: boolean;
  provider: "local" | "cloudflare_r2";
  local_dir: string;
  interval_hours: string;
  include: string[];
  last_max_files: string;
  r2_account_id: string;
  r2_access_key_id: string;
  r2_secret_access_key: string;
  r2_secret_access_key_configured: boolean;
  r2_bucket: string;
  r2_prefix: string;
};

export const BACKUP_PIPELINE_PHASES = [
  { key: "queued", label: "准备环境", detail: "初始化任务上下文与归档目录" },
  { key: "collecting", label: "收集文件清单", detail: "扫描配置、数据与媒体索引" },
  { key: "snapshotting", label: "锁定数据库快照", detail: "创建一致性冷快照副本" },
  { key: "archiving", label: "打包归档配置", detail: "压缩生成校验 ZIP 归档包" },
  { key: "uploading", label: "上传云端 R2", detail: "同步异地容灾对象存储" },
  { key: "finalizing", label: "校验与轮转清理", detail: "按保留上限回收过期备份" },
] as const;

export function defaultBackupForm(): BackupFormState {
  return {
    enabled: false,
    provider: "local",
    local_dir: "data/backups",
    interval_hours: "24",
    include: ["config", "data", "images"],
    last_max_files: "20",
    r2_account_id: "",
    r2_access_key_id: "",
    r2_secret_access_key: "",
    r2_secret_access_key_configured: false,
    r2_bucket: "",
    r2_prefix: "shengtu-backups",
  };
}

export function formFromBackupConfig(cfg?: BackupConfig | null): BackupFormState {
  const defaults = defaultBackupForm();
  if (!cfg) return defaults;
  const intervalMinutes = Math.max(1, Number(cfg.interval_minutes) || 1440);
  const intervalHours =
    intervalMinutes % 60 === 0
      ? String(intervalMinutes / 60)
      : String(Math.max(1, Math.round(intervalMinutes / 60)));
  const maxFiles = Math.min(100, Math.max(1, Number(cfg.last_max_files) || 20));
  const include =
    Array.isArray(cfg.include) && cfg.include.length > 0
      ? Array.from(new Set(cfg.include.map((v) => String(v).trim()).filter(Boolean)))
      : defaults.include;

  return {
    enabled: Boolean(cfg.enabled),
    provider: cfg.provider === "cloudflare_r2" ? "cloudflare_r2" : "local",
    local_dir: String(cfg.local_dir ?? defaults.local_dir),
    interval_hours: intervalHours,
    include,
    last_max_files: String(maxFiles),
    r2_account_id: String(cfg.r2_account_id ?? ""),
    r2_access_key_id: String(cfg.r2_access_key_id ?? ""),
    r2_secret_access_key: "",
    r2_secret_access_key_configured: Boolean(cfg.r2_secret_access_key_configured),
    r2_bucket: String(cfg.r2_bucket ?? ""),
    r2_prefix: String(cfg.r2_prefix ?? defaults.r2_prefix),
  };
}

function snapshotBackupForm(form: BackupFormState): string {
  return JSON.stringify({
    enabled: form.enabled,
    provider: form.provider,
    local_dir: form.local_dir.trim(),
    interval_hours: form.interval_hours.trim(),
    include: [...form.include].sort(),
    last_max_files: form.last_max_files.trim(),
    r2_account_id: form.r2_account_id.trim(),
    r2_access_key_id: form.r2_access_key_id.trim(),
    r2_secret_access_key: form.r2_secret_access_key.trim() ? "__provided__" : "",
    r2_bucket: form.r2_bucket.trim(),
    r2_prefix: form.r2_prefix.trim(),
  });
}

const idleState: BackupState = { status: "idle" };

export function formatBackupSize(value?: number) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatBackupDuration(durationMs?: number) {
  const ms = Number(durationMs || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function backupStatusText(state: BackupState) {
  const phaseMap: Record<string, string> = {
    queued: "准备环境",
    collecting: "收集文件清单",
    snapshotting: "锁定数据库快照",
    archiving: "打包归档配置",
    uploading: "上传云端 R2",
    finalizing: "校验与轮转清理",
  };
  if (state.status === "running") {
    return `正在执行${state.phase ? ` · ${phaseMap[state.phase] || state.phase}` : ""}`;
  }
  if (state.status === "success") return "最近备份成功";
  if (state.status === "failed") return "最近备份失败";
  return "尚未执行备份";
}

export function useBackupSettings() {
  const [form, setForm] = useState<BackupFormState>(defaultBackupForm);
  const [savedForm, setSavedForm] = useState<BackupFormState>(defaultBackupForm);
  const [state, setState] = useState<BackupState>(idleState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const pageVisible = usePageVisible();

  const loadBackupData = useCallback(
    async (options: { signal?: AbortSignal; silent?: boolean } = {}) => {
      const { signal, silent = false } = options;
      if (!silent) setIsLoading(true);
      try {
        const data = await fetchBackupConfig({ signal });
        if (signal?.aborted) return;
        const normalized = formFromBackupConfig(data.config);
        setForm(normalized);
        setSavedForm(normalized);
        setState(data.state || idleState);
      } catch (error) {
        if (!signal?.aborted) {
          toast.error(
            error instanceof Error ? error.message : "加载备份配置失败"
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
    void loadBackupData({ signal: controller.signal });
    return () => controller.abort();
  }, [loadBackupData]);

  const isDirty = useMemo(
    () =>
      !isLoading && snapshotBackupForm(form) !== snapshotBackupForm(savedForm),
    [form, isLoading, savedForm]
  );

  useEffect(() => {
    const handleTabRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab === "backup" && !isDirty) {
        void loadBackupData({ silent: true });
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
  }, [isDirty, loadBackupData]);

  useEffect(() => {
    if (state.status !== "running" || !pageVisible) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let reportedError = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const data = await fetchBackupRunStatus({ signal: controller.signal });
        if (stopped) return;
        reportedError = false;
        setState(data.state);
        if (data.state.status === "success") {
          toast.success("数据备份已完成");
        } else if (data.state.status === "failed") {
          toast.error(data.state.last_error || "备份任务执行失败");
        } else {
          timer = setTimeout(poll, 1600);
        }
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        if (!reportedError) {
          toast.error(
            error instanceof Error ? error.message : "查询备份运行状态失败"
          );
          reportedError = true;
        }
        timer = setTimeout(poll, 4500);
      }
    };

    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [pageVisible, state.status]);

  const updateForm = useCallback((updates: Partial<BackupFormState>) => {
    setForm((current) => ({ ...current, ...updates }));
  }, []);

  const updateInclude = useCallback((value: string, checked: boolean) => {
    setForm((current) => {
      const values = new Set(current.include);
      if (checked) values.add(value);
      else values.delete(value);
      return { ...current, include: Array.from(values) };
    });
  }, []);

  const validate = useCallback((): boolean => {
    const hours = Number(form.interval_hours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
      toast.error("备份执行周期需填写 1 - 720 小时之间的数值");
      return false;
    }
    const maxFiles = Number(form.last_max_files);
    if (
      !Number.isFinite(maxFiles) ||
      !Number.isInteger(maxFiles) ||
      maxFiles < 1 ||
      maxFiles > 100
    ) {
      toast.error("最大保留备份份数需为 1 - 100 之间的整数");
      return false;
    }
    if (form.include.length === 0) {
      toast.error("请至少勾选一项需要归档的备份内容");
      return false;
    }
    if (form.provider === "cloudflare_r2") {
      const hasSecret = Boolean(
        form.r2_secret_access_key.trim() ||
          form.r2_secret_access_key_configured
      );
      if (
        !form.r2_account_id.trim() ||
        !form.r2_bucket.trim() ||
        !form.r2_access_key_id.trim() ||
        !hasSecret
      ) {
        toast.error(
          "启用 R2 异地容灾前，请完整填写 R2 Account ID、Bucket、Access Key ID 与 Secret Access Key"
        );
        return false;
      }
    }
    return true;
  }, [form]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!validate()) return false;
    setIsSaving(true);
    try {
      const payload: Partial<BackupConfig> = {
        enabled: form.enabled,
        provider: form.provider,
        local_dir: form.local_dir.trim() || "data/backups",
        interval_minutes: Math.max(
          60,
          Math.round(Number(form.interval_hours) * 60)
        ),
        include: form.include,
        last_max_files: Math.min(
          100,
          Math.max(1, Math.round(Number(form.last_max_files)))
        ),
        r2_account_id: form.r2_account_id.trim(),
        r2_access_key_id: form.r2_access_key_id.trim(),
        r2_bucket: form.r2_bucket.trim(),
        r2_prefix: form.r2_prefix.trim() || "shengtu-backups",
      };
      if (form.r2_secret_access_key.trim()) {
        payload.r2_secret_access_key = form.r2_secret_access_key.trim();
      }
      const data = await updateBackupConfig(payload);
      const normalized = formFromBackupConfig(data.config);
      setForm(normalized);
      setSavedForm(normalized);
      setState(data.state || idleState);
      toast.success("数据备份策略已保存");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "保存备份配置失败"
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [form, validate]);

  const discard = useCallback(() => {
    setForm(savedForm);
    return true;
  }, [savedForm]);

  const run = useCallback(async () => {
    if (isDirty) {
      const saved = await save();
      if (!saved) return;
    }
    setIsStarting(true);
    try {
      const data = await runBackup();
      setState(data.state);
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.info(data.started ? "手动备份任务已启动" : "已有备份任务正在运行");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动备份失败");
    } finally {
      setIsStarting(false);
    }
  }, [isDirty, save]);

  useRegisterSettingsDirty({
    id: "backup-settings",
    tab: "backup",
    label: "数据备份策略",
    isDirty,
    validate,
    save,
    discard,
  });

  return {
    form,
    savedForm,
    updateForm,
    state,
    isDirty,
    isLoading,
    isSaving,
    isRunning: isStarting || state.status === "running",
    updateInclude,
    save,
    discard,
    run,
  };
}
