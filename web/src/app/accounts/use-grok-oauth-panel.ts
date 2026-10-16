import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteGrokOAuthAccounts,
  getGrokOAuthProtocolJob,
  importGrokOAuthCredential,
  listGrokOAuthAccounts,
  pollGrokOAuthDevice,
  refreshGrokOAuthAccount,
  setGrokOAuthAccountsDisabled,
  startGrokOAuthDevice,
  startGrokOAuthProtocol,
  syncGrokOAuthModels,
  type GrokOAuthAccount,
  type GrokOAuthDeviceSession,
  type GrokOAuthProtocolJob,
} from "@/lib/grok-accounts-api";

import { useGrokOAuthTest } from "./use-grok-oauth-test";

export function useGrokOAuthPanel(open: boolean, onChanged?: () => void) {
  const [accounts, setAccounts] = useState<GrokOAuthAccount[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [credentialText, setCredentialText] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [device, setDevice] = useState<GrokOAuthDeviceSession | null>(null);
  const [protocolJob, setProtocolJob] = useState<GrokOAuthProtocolJob | null>(null);
  const protocolTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listGrokOAuthAccounts({ status: "all" });
      setAccounts(Array.isArray(data.items) ? data.items : []);
      setAvailableModels(Array.isArray(data.available_models) ? data.available_models : []);
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "OAuth 账号加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
    return () => {
      if (protocolTimer.current !== null) window.clearTimeout(protocolTimer.current);
    };
  }, [open, load]);

  const test = useGrokOAuthTest(accounts, availableModels, setBusy, async () => {
    await load();
    onChanged?.();
  });
  const protocolRunning = ["pending", "running"].includes(String(protocolJob?.status || "").toLowerCase());

  function scheduleProtocolPoll(jobId: string) {
    if (protocolTimer.current !== null) window.clearTimeout(protocolTimer.current);
    protocolTimer.current = window.setTimeout(async () => {
      try {
        const { job } = await getGrokOAuthProtocolJob(jobId);
        setProtocolJob(job);
        const status = String(job?.status || "").toLowerCase();
        if (status === "authorized" || status === "completed") {
          toast.success(Array.isArray(job?.models) && job.models.length ? `协议授权成功：${job.models.join("、")}` : "协议授权成功");
          await load();
          onChanged?.();
          return;
        }
        if (status === "failed") {
          toast.error(String(job?.error || job?.message || "协议授权失败"));
          return;
        }
        scheduleProtocolPoll(jobId);
      } catch (pollError) {
        toast.error(pollError instanceof Error ? pollError.message : "协议状态读取失败");
      }
    }, 1500);
  }

  async function handleStartProtocol() {
    setBusy(true);
    try {
      const response = await startGrokOAuthProtocol();
      const job = response.job;
      if (!job?.id) {
        toast.error("启动协议失败：无任务 id");
        return;
      }
      setProtocolJob(job);
      toast.message(response.reused ? "协议任务已在运行" : "协议授权已启动");
      scheduleProtocolPoll(job.id);
    } catch (startError) {
      toast.error(startError instanceof Error ? startError.message : "无法启动协议授权");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartDevice() {
    setBusy(true);
    try {
      const session = await startGrokOAuthDevice();
      setDevice(session);
      if (session.verification_uri_complete) {
        window.open(session.verification_uri_complete, "_blank", "noopener,noreferrer");
      }
    } catch (startError) {
      toast.error(startError instanceof Error ? startError.message : "无法创建设备授权");
    } finally {
      setBusy(false);
    }
  }

  async function handlePollDevice() {
    if (!device?.id) return;
    setBusy(true);
    try {
      const result = await pollGrokOAuthDevice(device.id);
      if (String(result.status).toLowerCase() === "authorized") {
        setDevice(null);
        toast.success("设备码 OAuth 已连接");
        await load();
        onChanged?.();
      } else {
        toast.message("授权仍在等待中，请完成设备页确认后再检查");
      }
    } catch (pollError) {
      setDevice(null);
      toast.error(pollError instanceof Error ? pollError.message : "授权检查失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true);
    try {
      let credential: Record<string, unknown> | undefined;
      if (credentialText.trim()) {
        const parsed: unknown = JSON.parse(credentialText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("CPA OAuth JSON 必须是对象");
        credential = parsed as Record<string, unknown>;
      }
      await importGrokOAuthCredential({
        credential,
        access_token: accessToken || undefined,
        refresh_token: refreshToken || undefined,
      });
      setCredentialText("");
      setAccessToken("");
      setRefreshToken("");
      setShowImport(false);
      toast.success("OAuth 凭据已导入");
      await load();
      onChanged?.();
    } catch (importError) {
      toast.error(importError instanceof Error ? importError.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh(id: string) {
    setBusy(true);
    try {
      await refreshGrokOAuthAccount(id);
      toast.success("Token 已刷新");
      await load();
      onChanged?.();
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : "刷新失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncModels(id: string) {
    setBusy(true);
    try {
      await syncGrokOAuthModels(id);
      toast.success("模型已同步");
      await load();
      onChanged?.();
    } catch (syncError) {
      toast.error(syncError instanceof Error ? syncError.message : "模型同步失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(account: GrokOAuthAccount) {
    setBusy(true);
    try {
      const disabled = String(account.status || "").toLowerCase() !== "disabled";
      await setGrokOAuthAccountsDisabled([account.id], disabled);
      toast.success(disabled ? "已禁用" : "已启用");
      await load();
      onChanged?.();
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "状态更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm("确定删除该 OAuth 账号？")) return;
    setBusy(true);
    try {
      await deleteGrokOAuthAccounts([id]);
      toast.success("已删除");
      await load();
      onChanged?.();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return {
    accounts, availableModels, loading, busy, showImport, setShowImport, credentialText,
    setCredentialText, accessToken, setAccessToken, refreshToken, setRefreshToken, device,
    protocolJob, protocolRunning, test, load, handleStartProtocol, handleStartDevice,
    handlePollDevice, handleImport, handleRefresh, handleSyncModels, handleToggle, handleRemove,
  };
}

export type GrokOAuthController = ReturnType<typeof useGrokOAuthPanel>;
