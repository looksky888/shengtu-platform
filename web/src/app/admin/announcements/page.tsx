"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  ImagePlus,
  LoaderCircle,
  Megaphone,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { isSettingsRasterImage } from "@/app/settings/components/settings-raster-image";
import {
  AdminPageFrame,
  AdminSlideDrawer,
  AdminStatTile,
  AdminStatusBadge,
  AdminUnderlineTabs,
} from "@/components/admin";
import { AnnouncementDialog } from "@/components/announcement-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  broadcastAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  fetchAdminAnnouncements,
  updateAnnouncement,
  uploadAnnouncementImage,
  type Announcement,
  type AnnouncementBannerTone,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

type AnnouncementsTab = "popup" | "banner";

const ANNOUNCEMENT_TABS = [
  { value: "popup" as const, label: "系统弹窗公告（支持实时全员广播）" },
  { value: "banner" as const, label: "顶部常驻滚动横幅（4 色语义通知条）" },
] as const;

const BANNER_TONES: ReadonlyArray<{
  value: AnnouncementBannerTone;
  label: string;
  desc: string;
  cssVar: string;
}> = [
  {
    value: "notice",
    label: "常规通知 (Notice)",
    desc: "靛蓝语义条 · 日常通知与规则提示",
    cssVar: "var(--banner-notice-bg)",
  },
  {
    value: "activity",
    label: "运营活动 (Activity)",
    desc: "洋红语义条 · 限时充值优惠与上新活动",
    cssVar: "var(--banner-activity-bg)",
  },
  {
    value: "update",
    label: "版本更新 (Update)",
    desc: "青绿语义条 · 新模型上线与能力升级",
    cssVar: "var(--banner-update-bg)",
  },
  {
    value: "warning",
    label: "维护预警 (Warning)",
    desc: "琥珀语义条 · 渠道波动或停机维护提醒",
    cssVar: "var(--banner-warning-bg)",
  },
];

type DrawerFormState = {
  title: string;
  content: string;
  image_url: string;
  enabled: boolean;
  show_login: boolean;
  show_image: boolean;
  broadcast_now: boolean;
  display_mode: "popup" | "banner";
  banner_tone: AnnouncementBannerTone;
  link_url: string;
};

function createEmptyForm(mode: "popup" | "banner"): DrawerFormState {
  return {
    title: "",
    content: "",
    image_url: "",
    enabled: true,
    show_login: mode === "popup",
    show_image: true,
    broadcast_now: false,
    display_mode: mode,
    banner_tone: "notice",
    link_url: "",
  };
}

function formFromItem(item: Announcement): DrawerFormState {
  return {
    title: item.title || "",
    content: item.content || "",
    image_url: item.image_url || "",
    enabled: Boolean(item.enabled),
    show_login: Boolean(item.show_login),
    show_image: Boolean(item.show_image),
    broadcast_now: false,
    display_mode: item.display_mode === "banner" ? "banner" : "popup",
    banner_tone: item.banner_tone || "notice",
    link_url: item.link_url || "",
  };
}

export default function AdminAnnouncementsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/announcements");
  const [activeTab, setActiveTab] = useState<AnnouncementsTab>("popup");

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [form, setForm] = useState<DrawerFormState>(() => createEmptyForm("popup"));

  const [deletingItem, setDeletingItem] = useState<Announcement | null>(null);
  const [broadcastingItem, setBroadcastingItem] = useState<Announcement | null>(null);
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
    setEditingItem(null);
    setForm(createEmptyForm(mode));
    setDrawerOpen(true);
  };

  const openEdit = (item: Announcement) => {
    setEditingItem(item);
    setForm(formFromItem(item));
    setDrawerOpen(true);
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
    const content = form.content.trim() || (form.display_mode === "banner" ? form.title.trim() : "");
    if (!content) {
      toast.error(form.display_mode === "banner" ? "请填写横幅展示文案" : "请填写弹窗公告正文");
      return;
    }
    if (!form.show_login && !form.show_image) {
      toast.error("请至少勾选一个触达页面（登录页或创作台）");
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
        broadcast_now: form.display_mode === "popup" && form.enabled && form.broadcast_now,
        display_mode: form.display_mode,
        banner_tone: form.banner_tone,
        link_url: form.display_mode === "banner" ? trimmedLink : "",
      };

      const res = editingItem
        ? await updateAnnouncement(editingItem.id, payload)
        : await createAnnouncement(payload);

      setItems(Array.isArray(res?.items) ? res.items : []);
      setDrawerOpen(false);
      setEditingItem(null);
      toast.success(editingItem ? "通知配置已更新" : "通知已发布");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (item: Announcement, nextEnabled: boolean) => {
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
      toast.success(`已向所有在线用户实时推送弹窗「${target.title || "系统公告"}」`);
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

  const activePopupCount = popupItems.filter((i) => i.enabled).length;
  const activeBannerCount = bannerItems.filter((i) => i.enabled).length;

  return (
    <AdminPageFrame
      groupLabel="商业与运营"
      title="通知与公告"
      description="统一管理实时全员广播弹窗与工作台顶部 4 色 WCAG-AA 常驻滚动通知横幅（通过 SSE 秒级推送至在线用户）。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadAnnouncements()}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => openCreate(activeTab)}
          >
            <Plus className="size-3.5" />
            {activeTab === "banner" ? "+ 新建顶部横幅" : "+ 发布弹窗公告"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="展示中弹窗公告"
          value={`${activePopupCount} / ${popupItems.length}`}
          tone={activePopupCount > 0 ? "info" : "default"}
          hint="支持一键向在线用户强制弹出"
        />
        <AdminStatTile
          label="展示中顶部横幅"
          value={`${activeBannerCount} / ${bannerItems.length}`}
          tone={activeBannerCount > 0 ? "success" : "default"}
          hint="多条启用时自动 4.5s 平滑轮播"
        />
        <AdminStatTile
          label="实时推送通道"
          value="SSE 在线广播"
          tone="success"
          hint="/api/announcements/events 实时同步"
        />
      </div>

      <AdminUnderlineTabs
        items={ANNOUNCEMENT_TABS.map((tab) => ({
          ...tab,
          badge: tab.value === "popup" ? popupItems.length : bannerItems.length,
        }))}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="popup"
      />

      {activeTab === "popup" ? (
        <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
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
                  <td colSpan={5} className="py-10 text-center text-[var(--admin-text-muted)]">
                    <LoaderCircle className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              ) : popupItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[var(--admin-text-muted)]">
                    暂无系统弹窗公告，点击右上角「+ 发布弹窗公告」新建
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
                          <AdminStatusBadge tone="neutral">登录页</AdminStatusBadge>
                        ) : null}
                        {item.show_image ? (
                          <AdminStatusBadge tone="info">创作工作台</AdminStatusBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="font-mono text-[12px] text-[var(--admin-text-muted)]">
                      {(item.updated_at || "").replace("T", " ").slice(0, 19) || "—"}
                    </td>
                    <td>
                      <Switch
                        checked={item.enabled}
                        disabled={pendingIds.has(item.id)}
                        onCheckedChange={(checked) => void handleToggleEnabled(item, checked)}
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
          {/* 4-Tone Semantic Preview Strip */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {BANNER_TONES.map((tone) => (
              <div
                key={tone.value}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-white shadow-2xs"
                style={{ backgroundColor: tone.cssVar }}
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold">{tone.label}</div>
                  <div className="truncate text-[11px] text-white/80">{tone.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
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
                    <td colSpan={6} className="py-10 text-center text-[var(--admin-text-muted)]">
                      <LoaderCircle className="mx-auto size-4 animate-spin" />
                    </td>
                  </tr>
                ) : bannerItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[var(--admin-text-muted)]">
                      暂无顶部常驻滚动横幅，点击右上角「+ 新建顶部横幅」创建
                    </td>
                  </tr>
                ) : (
                  bannerItems.map((item) => {
                    const toneMeta =
                      BANNER_TONES.find((t) => t.value === item.banner_tone) ?? BANNER_TONES[0]!;
                    return (
                      <tr key={item.id}>
                        <td>
                          <span
                            className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
                            style={{ backgroundColor: toneMeta.cssVar }}
                          >
                            {toneMeta.label.split(" ")[0]}
                          </span>
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
                              <AdminStatusBadge tone="neutral">登录页</AdminStatusBadge>
                            ) : null}
                            {item.show_image ? (
                              <AdminStatusBadge tone="info">创作工作台</AdminStatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <Switch
                            checked={item.enabled}
                            disabled={pendingIds.has(item.id)}
                            onCheckedChange={(checked) => void handleToggleEnabled(item, checked)}
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Right Slide Drawer */}
      <AdminSlideDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={
          editingItem
            ? `编辑${form.display_mode === "banner" ? "顶部横幅" : "弹窗公告"}`
            : form.display_mode === "banner"
              ? "新建顶部常驻横幅"
              : "发布系统弹窗公告"
        }
        description={
          form.display_mode === "banner"
            ? "配置工作台顶部常驻语义通知条，保存后通过 SSE 实时同步至在线用户。"
            : "配置弹窗标题、正文、配图与立即全员广播策略。"
        }
        widthClassName="w-[min(480px,100vw)]"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setDrawerOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Megaphone className="size-3.5" />}
              {editingItem ? "保存修改" : "立即发布"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {form.display_mode === "banner" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-[var(--admin-text)]">
                  选择横幅语义色调（WCAG-AA 双模适配）
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BANNER_TONES.map((tone) => {
                    const selected = form.banner_tone === tone.value;
                    return (
                      <button
                        key={tone.value}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, banner_tone: tone.value }))
                        }
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all",
                          selected
                            ? "border-[var(--admin-text)] bg-[var(--admin-surface-2)]"
                            : "border-[var(--admin-border)] bg-[var(--admin-bg)] hover:border-[var(--admin-border-strong)]",
                        )}
                      >
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: tone.cssVar }}
                        >
                          {tone.label}
                        </span>
                        <span className="text-[11px] text-[var(--admin-text-muted)]">
                          {tone.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[12px] font-medium text-[var(--admin-text)]">实时效果预览</span>
                <div
                  className="flex min-h-9 items-center justify-center rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white"
                  style={{
                    backgroundColor:
                      BANNER_TONES.find((t) => t.value === form.banner_tone)?.cssVar ||
                      "var(--banner-notice-bg)",
                  }}
                >
                  <span className="truncate">
                    {form.title.trim()
                      ? `${form.title.trim()} · ${form.content.trim() || "在此输入横幅通知内容"}`
                      : form.content.trim() || "在此输入横幅通知内容"}
                  </span>
                </div>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[var(--admin-text)]">
              {form.display_mode === "banner" ? "短标签前缀（可选）" : "公告标题"}
            </label>
            <Input
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder={
                form.display_mode === "banner"
                  ? "例如：限时活动 / 新模型上线"
                  : "例如：平台算力升级公告"
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[var(--admin-text)]">
              {form.display_mode === "banner" ? "横幅滚动正文" : "公告正文内容"}
            </label>
            <Textarea
              rows={form.display_mode === "banner" ? 3 : 5}
              value={form.content}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, content: event.target.value }))
              }
              placeholder={
                form.display_mode === "banner"
                  ? "例如：GPT Image 2.5 现已开放 4K 超清模式，点击立即前往充值享赠送积分！"
                  : "请输入弹窗展示的详细通知说明..."
              }
            />
          </div>

          {form.display_mode === "banner" ? (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[var(--admin-text)]">
                点击跳转链接（可选，支持站内 `/wallet` 或外部 `https://...`）
              </label>
              <Input
                value={form.link_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, link_url: event.target.value }))
                }
                placeholder="例如：/wallet 或 https://docs.example.com"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-[var(--admin-text)]">
                  弹窗海报图片 URL（可选）
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-[var(--admin-text)] hover:underline">
                  <ImagePlus className="size-3.5" />
                  {uploadingImage ? "上传中..." : "本地上传"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void handleUploadImage(file);
                    }}
                  />
                </label>
              </div>
              <Input
                value={form.image_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, image_url: event.target.value }))
                }
                placeholder="/uploads/... 或 https://..."
              />
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-[var(--admin-text)]">立即启用展示</span>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-[var(--admin-text-muted)]">在创作工作台顶部/弹窗展示</span>
              <Switch
                checked={form.show_image}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, show_image: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-[var(--admin-text-muted)]">在登录页展示</span>
              <Switch
                checked={form.show_login}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, show_login: checked }))
                }
              />
            </div>
            {form.display_mode === "popup" ? (
              <div className="flex items-center justify-between border-t border-[var(--admin-border)] pt-2">
                <span className="text-[12.5px] font-medium text-[var(--admin-warning)]">
                  保存后立即向所有在线用户发起强制广播弹窗
                </span>
                <Switch
                  checked={form.broadcast_now}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, broadcast_now: checked }))
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      </AdminSlideDrawer>

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
