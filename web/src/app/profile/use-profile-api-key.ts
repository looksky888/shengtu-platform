import { useCallback, useState } from "react";
import { toast } from "sonner";

import { normalizeProfileKeys } from "@/app/profile/profile-utils";
import {
  deleteProfileAPIKey,
  fetchProfileAPIKey,
  revealProfileAPIKey,
  updateProfileAPIKey,
  upsertProfileAPIKey,
  type UserKey,
} from "@/lib/api";

const DEFAULT_KEY_NAME = "我的 API 令牌";

export function useProfileApiKey() {
  const [items, setItems] = useState<UserKey[]>([]);
  const [keyName, setKeyName] = useState(DEFAULT_KEY_NAME);
  const [revealedKey, setRevealedKey] = useState("");
  const [isLoadingKey, setIsLoadingKey] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRotateDialogOpen, setIsRotateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const key = items[0] || null;
  const hasKey = Boolean(key);
  const isNameDirty = Boolean(key) && keyName.trim() !== (key?.name || "");

  const applyItems = useCallback((nextItems: UserKey[]) => {
    const normalized = normalizeProfileKeys(nextItems);
    setItems(normalized);
    setKeyName((currentName) => {
      if (normalized[0]?.name) {
        return normalized[0].name;
      }
      return currentName.trim() || DEFAULT_KEY_NAME;
    });
  }, []);

  const loadKey = useCallback(async () => {
    setIsLoadingKey(true);
    try {
      const data = await fetchProfileAPIKey();
      applyItems(data.items);
      setRevealedKey("");
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
      applyItems(data.items);
      setRevealedKey(data.key);
      setIsRotateDialogOpen(false);
      toast.success(hasKey ? "密钥已重新生成" : "密钥已生成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成密钥失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReveal = async () => {
    if (!key) {
      return;
    }
    if (revealedKey) {
      setRevealedKey("");
      return;
    }
    setIsRevealing(true);
    try {
      const data = await revealProfileAPIKey(key.id);
      setRevealedKey(data.key);
      toast.success("密钥已显示");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "查看密钥失败");
    } finally {
      setIsRevealing(false);
    }
  };

  const handleSaveName = async () => {
    if (!key || !isNameDirty) {
      return;
    }
    setIsSavingName(true);
    try {
      const data = await updateProfileAPIKey(key.id, { name: keyName.trim() });
      applyItems(data.items);
      toast.success("名称已保存");
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
      applyItems(data.items);
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
      applyItems(data.items);
      setRevealedKey("");
      setIsDeleteDialogOpen(false);
      toast.success("密钥已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除密钥失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    key,
    keyName,
    revealedKey,
    hasKey,
    isNameDirty,
    isLoadingKey,
    isSavingName,
    isGenerating,
    isRevealing,
    isToggling,
    isDeleting,
    isRotateDialogOpen,
    isDeleteDialogOpen,
    setKeyName,
    setIsRotateDialogOpen,
    setIsDeleteDialogOpen,
    loadKey,
    handleGenerate,
    handleReveal,
    handleSaveName,
    handleToggle,
    handleDelete,
  };
}
