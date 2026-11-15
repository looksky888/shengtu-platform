"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  Radio,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { isSettingsRasterImage } from "@/app/settings/components/settings-raster-image";
import { SETTINGS_TAB_REFRESH_EVENT } from "@/app/settings/settings-tab-types";
import {
  AdminPageFrame,
  AdminStatTile,
  AdminStatusBadge,
} from "@/components/admin";
import { AnnouncementDialog } from "@/components/announcement-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  broadcastAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  fetchAdminAnnouncements,
  updateAnnouncement,
  uploadAnnouncementImage,
  type Announcement,
} from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

import {
  BannerToneBadge,
  BannerTonePreviewStrip,
} from "./announcement-banner-preview";
import { AnnouncementEditorDrawer } from "./announcement-editor-drawer";
import {
  createEmptyForm,
  formFromItem,
  type DrawerFormState,
} from "./announcement-helpers";

type AnnouncementsTab = "popup" | "banner";

const SEGMENT_OPTIONS: readonly { value: AnnouncementsTab; label: string }[] = [
  { value: "banner", label: "顶部横幅" },
  { value: "popup", label: "弹窗公告" },
];

export default function AdminAnnouncementsPage({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const { isCheckingAuth, session } = useAuthGuard(
    undefined,
    embedded ? "/settings" : "/admin/announcements",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = embedded ? "subtab" : "tab";
  const rawSubtab = searchParams.get(queryKey);
  const [activeTab, setActiveTab] = useState<AnnouncementsTab>(() =>
    rawSubtab === "banner" ? "banner" : "popup",
  );

  useEffect(() => {
    if (rawSubtab === "banner" || rawSubtab === "popup") {
      setActiveTab(rawSubtab);
    }
  }, [rawSubtab]);

  const handleSelectTab = (nextTab: AnnouncementsTab) => {
    setActiveTab(nextTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextTab === "popup") {
          next.delete(queryKey);
        } else {
          next.set(queryKey, nextTab);
        }
        return next;
      },
      { replace: true },
    );
  };

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [form, setForm] = useState<DrawerFormState>(() =>
    createEmptyForm("popup"),
  );
  const [baselineForm, setBaselineForm] = useState<DrawerFormState>(() =>
    createEmptyForm("popup"),
  );

  const [deletingItem, setDeletingItem] = useState<Announcement | null>(null);
  const [broadcastingItem, setBroadcastingItem] =
    useState<Announcement | null>(null);
  const [previewPopup, setPreviewPopup] = useState<Announcement | null>(null);

  const loadAnnouncements = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchAdminAnnouncements();
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载公告失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void loadAnnouncements();
  }, [loadAnnouncements, session]);

  useEffect(() => {
    if (!session) return;
    const handleTabRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (
        !detail?.tab ||
        detail.tab === "announcements" ||
        detail.tab === "announcement"
      ) {
        void loadAnnouncements(true);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
  }, [loadAnnouncements, session]);

  const setPending = (id: string, value: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const popupItems = useMemo(
    () => items.filter((item) => item.display_mode !== "banner"),
    [items],
  );
  const bannerItems = useMemo(
    () => items.filter((item) => item.display_mode === "banner"),
    [items],
  );

  const openCreate = (mode: "popup" | "banner") => {
    const initial = createEmptyForm(mode);
    setEditingItem(null);
    setForm(initial);
    setBaselineForm(initial);
    setDrawerOpen(true);
  };

  const openEdit = (item: Announcement) => {
    const initial = formFromItem(item);
    setEditingItem(item);
    setForm(initial);
    setBaselineForm(initial);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingItem(null);
  };

  const handleUploadImage = async (file?: File | null) => {
    if (!file) return;
    if (!isSettingsRasterImage(file)) {
      toast.error("仅支持 JPEG、PNG、GIF 或 WebP 图片");
      return;
    }
    setUploadingImage(true);
    try {
      const res = await uploadAnnouncementImage(file);
      setForm((prev) => ({ ...prev, image_url: res.image_url }));
      toast.success("公告配图已上传");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传图片失败");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const content =
      form.content.trim() ||
      (form.display_mode === "banner" ? form.title.trim() : "");
    if (!content) {
      toast.error(
        form.display_mode === "banner"
          ? "请填写横幅展示文案"
          : "请填写弹窗公告正文",
      );
      return;
    }
    if (!form.show_login && !form.show_image) {
      toast.error("请至少勾选一个触达页面（登录页或创作工作台）");
      return;
    }
    const trimmedLink = form.link_url.trim();
    if (
      trimmedLink &&
      !trimmedLink.startsWith("/") &&
      !trimmedLink.startsWith("http://") &&
      !trimmedLink.startsWith("https://")
    ) {
      toast.error("跳转链接需以 /、http:// 或 https:// 开头");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content,
        image_url: form.display_mode === "popup" ? form.image_url.trim() : "",
        enabled: form.enabled,
        show_login: form.show_login,
        show_image: form.show_image,
        broadcast_now:
          form.display_mode === "popup" && form.enabled && form.broadcast_now,
        display_mode: form.display_mode,
        banner_tone: form.banner_tone,
        link_url: form.display_mode === "banner" ? trimmedLink : "",
      };

      const res = editingItem
        ? await updateAnnouncement(editingItem.id, payload)
        : await createAnnouncement(payload);

      setItems(Array.isArray(res?.items) ? res.items : []);
      closeDrawer();
      toast.success(editingItem ? "通知配置已更新" : "通知已发布");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (
    item: Announcement,
    nextEnabled: boolean,
  ) => {
    setPending(item.id, true);
    try {
      const res = await updateAnnouncement(item.id, { enabled: nextEnabled });
      setItems(Array.isArray(res?.items) ? res.items : []);
      toast.success(nextEnabled ? "已启用展示" : "已停用展示");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新状态失败");
    } finally {
      setPending(item.id, false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastingItem) return;
    const target = broadcastingItem;
    setPending(target.id, true);
    try {
      const res = await broadcastAnnouncement(target.id);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setBroadcastingItem(null);
      toast.success(
        `已向所有在线用户实时推送弹窗「${target.title || "系统公告"}」`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "全员广播失败");
    } finally {
      setPending(target.id, false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    const target = deletingItem;
    setPending(target.id, true);
    try {
      const res = await deleteAnnouncement(target.id);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setDeletingItem(null);
      toast.success("已删除该条通知");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setPending(target.id, false);
    }
  };

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  const activePopupCount = popupItems.filter((item) => item.enabled).length;
  const activeBannerCount = bannerItems.filter((item) => item.enabled).length;

  return (
    <AdminPageFrame
      embedded={embedded}
      groupLabel="商业与运营"
      title="通知与公告"
      description="统一管理实时全员广播弹窗与工作台顶部 4 色常驻滚动通知横幅，保存后毫秒级推送至所有在线客户端。"
    >
      <div id="settings-section-announcements-list" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <AdminStatTile
            label="展示中弹窗公告"
            value={`${activePopupCount} / ${popupItems.length}`}
            tone={activePopupCount > 0 ? "info" : "default"}
            hint="支持一键向在线用户实时弹出"
          />
          <AdminStatTile
            label="展示中顶部横幅"
            value={`${activeBannerCount} / ${bannerItems.length}`}
            tone={activeBannerCount > 0 ? "success" : "default"}
            hint="多条启用时自动 4.5 秒平滑轮播"
          />
          <AdminStatTile
            label="实时推送通道"
            value="在线长连接广播"
            tone="success"
            hint="全站在线客户端实时同步生效"
          />
        </div>

        {/* Compact Segmented Pill Toggle + Primary Action */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div
            role="tablist"
            aria-label="通知展示形态"
            className="inline-flex items-center gap-1 rounded-xl border border-border/75 bg-surface-subtle/70 p-1"
          >
            {SEGMENT_OPTIONS.map((option) => {
              const selected = activeTab === option.value;
              const count =
                option.value === "popup"
                  ? popupItems.length
                  : bannerItems.length;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => handleSelectTab(option.value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors",
                    selected
                      ? "bg-primary/[0.08] font-medium text-primary ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-surface-hover/60 hover:text-foreground",
                  )}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                      selected
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => openCreate(activeTab)}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <Plus className="size-3.5" />
            <span>
              {activeTab === "banner" ? "新建顶部横幅" : "发布弹窗公告"}
            </span>
          </Button>
        </div>

        {activeTab === "popup" ? (
          <div className="admin-table-card overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>公告标题 / 摘要</th>
                  <th>触达页面</th>
                  <th>最近更新时间</th>
                  <th>启用状态</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-10 text-center text-[var(--admin-text-muted)]"
                    >
                      <LoaderCircle className="mx-auto size-4 animate-spin" />
                    </td>
                  </tr>
                ) : popupItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-10 text-center text-[var(--admin-text-muted)]"
                    >
                      暂无系统弹窗公告，点击右上角「发布弹窗公告」新建
                    </td>
                  </tr>
                ) : (
                  popupItems.map((item) => (
                    <tr key={item.id}>
                      <td className="max-w-[360px]">
                        <div className="font-medium text-[var(--admin-text)]">
                          {item.title || "系统公告"}
                        </div>
                        <div className="truncate text-[12px] text-[var(--admin-text-muted)]">
                          {item.content}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {item.show_login ? (
                            <AdminStatusBadge tone="neutral">
                              登录页
                            </AdminStatusBadge>
                          ) : null}
                          {item.show_image ? (
                            <AdminStatusBadge tone="info">
                              创作工作台
                            </AdminStatusBadge>
                          ) : null}
                        </div>
                      </td>
                      <td className="font-mono text-[12px] tabular-nums text-[var(--admin-text-muted)]">
                        {formatDateTime(item.updated_at)}
                      </td>
                      <td>
                        <Switch
                          checked={item.enabled}
                          disabled={pendingIds.has(item.id)}
                          onCheckedChange={(checked) =>
                            void handleToggleEnabled(item, checked)
                          }
                        />
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setPreviewPopup(item)}
                          >
                            <Eye className="size-3" />
                            预览
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={!item.enabled || pendingIds.has(item.id)}
                            onClick={() => setBroadcastingItem(item)}
                          >
                            <Radio className="size-3" />
                            全员广播
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="size-3" />
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="destructive-outline"
                            size="xs"
                            onClick={() => setDeletingItem(item)}
                          >
                            <Trash2 className="size-3" />
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            <BannerTonePreviewStrip />

            <div className="admin-table-card overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>语义色调</th>
                    <th>横幅文案</th>
                    <th>点击跳转链接</th>
                    <th>触达范围</th>
                    <th>启用状态</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-10 text-center text-[var(--admin-text-muted)]"
                      >
                        <LoaderCircle className="mx-auto size-4 animate-spin" />
                      </td>
                    </tr>
                  ) : bannerItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-10 text-center text-[var(--admin-text-muted)]"
                      >
                        暂无顶部常驻滚动横幅，点击右上角「新建顶部横幅」创建
                      </td>
                    </tr>
                  ) : (
                    bannerItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <BannerToneBadge tone={item.banner_tone} />
                        </td>
                        <td className="max-w-[340px]">
                          <div className="truncate font-medium text-[var(--admin-text)]">
                            {item.title
                              ? `${item.title} · ${item.content}`
                              : item.content}
                          </div>
                        </td>
                        <td className="font-mono text-[12px] text-[var(--admin-text-muted)]">
                          {item.link_url || "—"}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {item.show_login ? (
                              <AdminStatusBadge tone="neutral">
                                登录页
                              </AdminStatusBadge>
                            ) : null}
                            {item.show_image ? (
                              <AdminStatusBadge tone="info">
                                创作工作台
                              </AdminStatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <Switch
                            checked={item.enabled}
                            disabled={pendingIds.has(item.id)}
                            onCheckedChange={(checked) =>
                              void handleToggleEnabled(item, checked)
                            }
                          />
                        </td>
                        <td className="text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => openEdit(item)}
                            >
                              <Pencil className="size-3" />
                              编辑
                            </Button>
                            <Button
                              type="button"
                              variant="destructive-outline"
                              size="xs"
                              onClick={() => setDeletingItem(item)}
                            >
                              <Trash2 className="size-3" />
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnnouncementEditorDrawer
        open={drawerOpen}
        editingItem={editingItem}
        form={form}
        baselineForm={baselineForm}
        saving={saving}
        uploadingImage={uploadingImage}
        setForm={setForm}
        onUploadImage={handleUploadImage}
        onSave={handleSave}
        onForceClose={closeDrawer}
      />

      <ConfirmDialog
        open={Boolean(broadcastingItem)}
        title="确认立即向所有在线用户发起全员广播弹窗？"
        description={
          broadcastingItem
            ? `即将向正在访问对应页面的所有在线用户实时弹出「${broadcastingItem.title || "系统公告"}」。`
            : ""
        }
        confirmLabel="立即全员推送"
        pending={broadcastingItem ? pendingIds.has(broadcastingItem.id) : false}
        onClose={() => setBroadcastingItem(null)}
        onConfirm={() => void handleBroadcast()}
      />

      <ConfirmDialog
        open={Boolean(deletingItem)}
        title="确认删除该条通知？"
        description="删除后在线客户端将立即停止展示该条通知。"
        confirmLabel="确认删除"
        destructive
        pending={deletingItem ? pendingIds.has(deletingItem.id) : false}
        onClose={() => setDeletingItem(null)}
        onConfirm={() => void handleDelete()}
      />

      <AnnouncementDialog
        activeAnnouncement={previewPopup}
        activeIndex={0}
        totalCount={1}
        autoQueueLength={1}
        onClose={() => setPreviewPopup(null)}
      />
    </AdminPageFrame>
  );
}
