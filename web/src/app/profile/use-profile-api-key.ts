import { useCallback, useState } from "react";
import { toast } from "sonner";

import { normalizeProfileKeys } from "@/app/profile/profile-utils";
import {
  deleteProfileAPIKey,
  fetchProfileAPIKey,
  testProfileAPIKeyConnectivity,
  updateProfileAPIKey,
  upsertProfileAPIKey,
  type ProfileApiKeyRateLimits,
  type UserKey,
} from "@/lib/api";

const DEFAULT_KEY_NAME = "我的 API 令牌";
const STORAGE_REMEMBER_PREF = "shengtu.profile.remember_api_key";
const STORAGE_KEY_PREFIX = "shengtu.profile.saved_api_key.";

function readRememberPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_REMEMBER_PREF);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function readSavedPlaintextKey(keyId?: string | null): string {
  if (!keyId || typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${keyId}`)?.trim() || "";
  } catch {
    return "";
  }
}

function writeSavedPlaintextKey(keyId: string, rawKey: string) {
  if (!keyId || typeof window === "undefined") return;
  try {
    // Clear older saved keys first so only the active key is stored
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_KEY_PREFIX)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
    if (rawKey.trim()) {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${keyId}`, rawKey.trim());
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function clearSavedPlaintextKeys() {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_KEY_PREFIX)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore storage errors
  }
}

export type ApiKeyConnectivityResult = {
  ok: boolean;
  latencyMs?: number;
  modelCount?: number;
  sampleModels?: string[];
  message?: string;
  testedAt: string;
};

export function useProfileApiKey() {
  const [items, setItems] = useState<UserKey[]>([]);
  const [rateLimits, setRateLimits] = useState<ProfileApiKeyRateLimits | null>(null);
  const [keyName, setKeyName] = useState(DEFAULT_KEY_NAME);
  const [plaintextKey, setPlaintextKey] = useState("");
  const [justGeneratedKey, setJustGeneratedKey] = useState("");
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [rememberLocally, setRememberLocally] = useState<boolean>(() => readRememberPref());
  const [isLoadingKey, setIsLoadingKey] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ApiKeyConnectivityResult | null>(null);
  const [isRotateDialogOpen, setIsRotateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const key = items[0] || null;
  const hasKey = Boolean(key);
  const isNameDirty = Boolean(key) && keyName.trim() !== (key?.name || "");
  const activePlaintextKey = justGeneratedKey || plaintextKey;
  const revealedKey = isKeyVisible ? activePlaintextKey : "";

  const applyItems = useCallback(
    (nextItems: UserKey[], nextLimits?: ProfileApiKeyRateLimits) => {
      const normalized = normalizeProfileKeys(nextItems);
      setItems(normalized);
      if (nextLimits) {
        setRateLimits(nextLimits);
      }
      const primary = normalized[0];
      setKeyName((currentName) => {
        if (primary?.name) {
          return primary.name;
        }
        return currentName.trim() || DEFAULT_KEY_NAME;
      });
      if (primary?.id) {
        const cached = readSavedPlaintextKey(primary.id);
        setPlaintextKey(cached);
      } else {
        setPlaintextKey("");
      }
    },
    []
  );

  const loadKey = useCallback(async () => {
    setIsLoadingKey(true);
    try {
      const data = await fetchProfileAPIKey();
      applyItems(data.items, data.rate_limits);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载个人密钥失败");
    } finally {
      setIsLoadingKey(false);
    }
  }, [applyItems]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const data = await upsertProfileAPIKey(keyName.trim());
      if (rememberLocally && data.item?.id && data.key) {
        writeSavedPlaintextKey(data.item.id, data.key);
      }
      applyItems(data.items, data.rate_limits);
      setPlaintextKey(data.key);
      setJustGeneratedKey(data.key);
      setIsKeyVisible(true);
      setTestResult(null);
      setIsRotateDialogOpen(false);
      toast.success(hasKey ? "新密钥已生成，旧密钥已失效" : "接口密钥已生成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成密钥失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReveal = () => {
    if (!key) return;
    if (isKeyVisible) {
      setIsKeyVisible(false);
      return;
    }
    if (activePlaintextKey) {
      setIsKeyVisible(true);
      return;
    }
    toast.info("服务端仅存储不可逆加密哈希；如需获取完整明文请点击「重新生成」并在当前浏览器勾选记住");
  };

  const handleToggleRememberLocally = (next: boolean) => {
    setRememberLocally(next);
    try {
      window.localStorage.setItem(STORAGE_REMEMBER_PREF, next ? "1" : "0");
    } catch {
      // Ignore storage error
    }
    if (!next) {
      clearSavedPlaintextKeys();
      if (!justGeneratedKey) {
        setPlaintextKey("");
        setIsKeyVisible(false);
      }
      toast.success("已清除当前浏览器缓存的密钥明文");
    } else if (key?.id && activePlaintextKey) {
      writeSavedPlaintextKey(key.id, activePlaintextKey);
      toast.success("已在当前浏览器安全记住该密钥");
    }
  };

  const handleSaveName = async () => {
    if (!key || !isNameDirty) {
      return;
    }
    setIsSavingName(true);
    try {
      const data = await updateProfileAPIKey(key.id, { name: keyName.trim() });
      applyItems(data.items, data.rate_limits);
      toast.success("密钥名称已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存名称失败");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleToggle = async () => {
    if (!key) {
      return;
    }
    setIsToggling(true);
    try {
      const data = await updateProfileAPIKey(key.id, { enabled: !key.enabled });
      applyItems(data.items, data.rate_limits);
      toast.success(key.enabled ? "密钥已禁用" : "密钥已启用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新密钥失败");
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!key) {
      return;
    }
    setIsDeleting(true);
    try {
      const data = await deleteProfileAPIKey(key.id);
      clearSavedPlaintextKeys();
      applyItems(data.items, data.rate_limits);
      setPlaintextKey("");
      setJustGeneratedKey("");
      setIsKeyVisible(false);
      setTestResult(null);
      setIsDeleteDialogOpen(false);
      toast.success("密钥已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除密钥失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTestConnectivity = async () => {
    if (!key) {
      toast.error("请先生成接口密钥");
      return;
    }
    if (!key.enabled) {
      toast.error("当前密钥已处于禁用状态，请先启用后再测试");
      return;
    }
    setIsTesting(true);
    try {
      const res = await testProfileAPIKeyConnectivity(activePlaintextKey || undefined);
      const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      setTestResult({
        ok: true,
        latencyMs: res.latencyMs,
        modelCount: res.modelCount,
        sampleModels: res.sampleModels,
        message: `200 OK · 耗时 ${res.latencyMs}ms · 发现 ${res.modelCount} 个可用模型`,
        testedAt: now,
      });
      toast.success(`接口连通正常（${res.latencyMs}ms · ${res.modelCount} 个模型可用）`);
    } catch (error) {
      const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      const message = error instanceof Error ? error.message : "接口连通测试失败";
      setTestResult({
        ok: false,
        message,
        testedAt: now,
      });
      toast.error(`连通性测试失败：${message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return {
    key,
    rateLimits,
    keyName,
    revealedKey,
    activePlaintextKey,
    justGeneratedKey,
    isKeyVisible,
    rememberLocally,
    hasKey,
    isNameDirty,
    isLoadingKey,
    isSavingName,
    isGenerating,
    isToggling,
    isDeleting,
    isTesting,
    testResult,
    isRotateDialogOpen,
    isDeleteDialogOpen,
    setKeyName,
    setIsRotateDialogOpen,
    setIsDeleteDialogOpen,
    loadKey,
    handleGenerate,
    handleReveal,
    handleToggleRememberLocally,
    handleSaveName,
    handleToggle,
    handleDelete,
    handleTestConnectivity,
  };
}
