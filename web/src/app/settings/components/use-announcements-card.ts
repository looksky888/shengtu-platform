"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  broadcastAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  fetchAdminAnnouncements,
  updateAnnouncement,
  uploadAnnouncementImage,
  type Announcement,
} from "@/lib/api";

import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";
import type { AnnouncementForm } from "./announcements-types";
import {
  buildDraftPreviewAnnouncement,
  emptyAnnouncementForm,
  formFromAnnouncement,
} from "./announcements-utils";
import { isSettingsRasterImage } from "./settings-raster-image";

function safeAnnouncementList(
  items: Announcement[] | null | undefined,
): Announcement[] {
  return Array.isArray(items) ? items : [];
}

export function useAnnouncementsCard() {
  const didLoadRef = useRef(false);
  const [items, setItems] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [deletingItem, setDeletingItem] = useState<Announcement | null>(null);
  const [broadcastingItem, setBroadcastingItem] = useState<Announcement | null>(
    null,
  );
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(emptyAnnouncementForm);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    const { silent = false } = options;
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchAdminAnnouncements();
      setItems(safeAnnouncementList(data?.items));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载公告失败");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    const handleTabRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab === "announcement") {
        void load({ silent: true });
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
  }, [load]);

  const setItemPending = (id: string, isPending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (isPending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setForm(emptyAnnouncementForm);
    setDialogOpen(true);
  };

  const openEditDialog = (item: Announcement) => {
    setEditingItem(item);
    setForm(formFromAnnouncement(item));
    setDialogOpen(true);
  };

  const openDraftPreview = () => {
    setPreviewItem(buildDraftPreviewAnnouncement(form, editingItem));
  };

  const updateForm = (updates: Partial<AnnouncementForm>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const handleImageUpload = async (file?: File | null) => {
    if (!file) return;
    if (!isSettingsRasterImage(file)) {
      toast.error("仅支持 JPEG、PNG、GIF 或 WebP 图片");
      return;
    }
    setIsUploadingImage(true);
    try {
      const data = await uploadAnnouncementImage(file);
      updateForm({ image_url: data.image_url });
      toast.success("公告图片已上传");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传公告图片失败");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const shouldBroadcast = Boolean(form.enabled && form.broadcast_now);
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      image_url: form.image_url.trim(),
      enabled: form.enabled,
      show_login: form.show_login,
      show_image: form.show_image,
      broadcast_now: shouldBroadcast,
    };
    if (!payload.content) {
      toast.error("请输入公告内容");
      return;
    }
    if (!payload.show_login && !payload.show_image) {
      toast.error("请选择至少一个展示位置");
      return;
    }

    setIsSaving(true);
    try {
      const data = editingItem
        ? await updateAnnouncement(editingItem.id, payload)
        : await createAnnouncement(payload);
      setItems(safeAnnouncementList(data?.items));
      setDialogOpen(false);
      setEditingItem(null);
      setForm(emptyAnnouncementForm);
      if (shouldBroadcast) {
        toast.success(
          editingItem
            ? "公告已更新并立即向所有在线用户发起弹窗"
            : "公告已发布并立即向所有在线用户发起弹窗",
        );
      } else {
        toast.success(editingItem ? "公告已更新" : "公告已创建");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存公告失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastingItem) return;
    const item = broadcastingItem;
    setItemPending(item.id, true);
    try {
      const data = await broadcastAnnouncement(item.id);
      setItems(safeAnnouncementList(data?.items));
      setBroadcastingItem(null);
      toast.success(
        `已向所有在线用户发起「${item.title || "站内公告"}」全员弹窗推送`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "发起全员弹窗推送失败",
      );
    } finally {
      setItemPending(item.id, false);
    }
  };

  const handleToggleEnabled = async (item: Announcement) => {
    setItemPending(item.id, true);
    try {
      const data = await updateAnnouncement(item.id, {
        enabled: !item.enabled,
      });
      setItems(safeAnnouncementList(data?.items));
      toast.success(item.enabled ? "公告已停用" : "公告已启用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新公告失败");
    } finally {
      setItemPending(item.id, false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    const item = deletingItem;
    setItemPending(item.id, true);
    try {
      const data = await deleteAnnouncement(item.id);
      setItems(safeAnnouncementList(data?.items));
      setDeletingItem(null);
      toast.success("公告已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除公告失败");
    } finally {
      setItemPending(item.id, false);
    }
  };

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === "enabled" && !item.enabled) return false;
      if (statusFilter === "disabled" && item.enabled) return false;
      if (!normalizedQuery) return true;
      return `${item.title ?? ""} ${item.content ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [items, query, statusFilter]);

  return {
    items,
    visibleItems,
    query,
    statusFilter,
    isLoading,
    isSaving,
    pendingIds,
    dialogOpen,
    editingItem,
    deletingItem,
    broadcastingItem,
    previewItem,
    form,
    isUploadingImage,
    setDialogOpen,
    setDeletingItem,
    setBroadcastingItem,
    setPreviewItem,
    openDraftPreview,
    updateForm,
    openCreateDialog,
    openEditDialog,
    handleImageUpload,
    handleSave,
    handleBroadcast,
    handleToggleEnabled,
    handleDelete,
    setQuery,
    setStatusFilter,
  };
}

export type AnnouncementsCardState = ReturnType<typeof useAnnouncementsCard>;
