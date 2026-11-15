"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ImagePlus, LoaderCircle, Megaphone } from "lucide-react";

import { AdminSlideDrawer } from "@/components/admin";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Announcement } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BannerLivePreviewBar } from "./announcement-banner-preview";
import {
  BANNER_TONES,
  type DrawerFormState,
} from "./announcement-helpers";

function serializeFormSnapshot(state: DrawerFormState): string {
  return JSON.stringify({
    title: state.title.trim(),
    content: state.content.trim(),
    image_url: state.image_url.trim(),
    enabled: Boolean(state.enabled),
    show_login: Boolean(state.show_login),
    show_image: Boolean(state.show_image),
    broadcast_now: Boolean(state.broadcast_now),
    display_mode: state.display_mode,
    banner_tone: state.banner_tone,
    link_url: state.link_url.trim(),
  });
}

export function AnnouncementEditorDrawer({
  open,
  editingItem,
  form,
  baselineForm,
  saving,
  uploadingImage,
  setForm,
  onUploadImage,
  onSave,
  onForceClose,
}: {
  open: boolean;
  editingItem: Announcement | null;
  form: DrawerFormState;
  baselineForm: DrawerFormState;
  saving: boolean;
  uploadingImage: boolean;
  setForm: Dispatch<SetStateAction<DrawerFormState>>;
  onUploadImage: (file?: File | null) => Promise<void>;
  onSave: () => Promise<void>;
  onForceClose: () => void;
}) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const isDraftDirty = useMemo(
    () => serializeFormSnapshot(form) !== serializeFormSnapshot(baselineForm),
    [baselineForm, form],
  );

  const requestClose = () => {
    if (saving) return;
    if (isDraftDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onForceClose();
  };

  return (
    <>
      <AdminSlideDrawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            requestClose();
          }
        }}
        title={
          editingItem
            ? `编辑${form.display_mode === "banner" ? "顶部横幅" : "弹窗公告"}`
            : form.display_mode === "banner"
              ? "新建顶部常驻横幅"
              : "发布系统弹窗公告"
        }
        description={
          form.display_mode === "banner"
            ? "配置工作台顶部常驻语义通知条，保存后实时同步至所有在线用户。"
            : "配置弹窗标题、正文、配图与立即全员广播策略。"
        }
        widthClassName="w-[min(520px,100vw)]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {isDraftDirty ? "当前草稿有未保存修改" : "填写完毕后点击右侧发布"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={requestClose}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void onSave()}
              >
                {saving ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Megaphone className="size-3.5" />
                )}
                {editingItem ? "保存修改" : "立即发布"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {form.display_mode === "banner" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  选择横幅语义色调
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {BANNER_TONES.map((tone) => {
                    const selected = form.banner_tone === tone.value;
                    return (
                      <button
                        key={tone.value}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            banner_tone: tone.value,
                          }))
                        }
                        className={cn(
                          "flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-colors",
                          selected
                            ? "border-primary/45 bg-primary/[0.07] ring-1 ring-primary/20"
                            : "border-border/75 bg-surface-subtle/45 hover:border-border-strong/75 hover:bg-surface-hover/50",
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span
                            className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                            style={{ backgroundColor: tone.cssVar }}
                          >
                            {tone.label}
                          </span>
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              selected ? "bg-primary" : "bg-border-strong",
                            )}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {tone.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <BannerLivePreviewBar
                tone={form.banner_tone}
                title={form.title}
                content={form.content}
              />
            </>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground">
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
            <label className="text-[12px] font-medium text-foreground">
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
                  : "请输入弹窗展示的详细通知说明…"
              }
            />
          </div>

          {form.display_mode === "banner" ? (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">
                点击跳转链接（可选，支持站内路径或外部链接）
              </label>
              <Input
                value={form.link_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, link_url: event.target.value }))
                }
                placeholder="例如：/recharge 或 https://docs.example.com"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-foreground">
                  弹窗海报图片地址（可选）
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-primary hover:underline">
                  <ImagePlus className="size-3.5" />
                  {uploadingImage ? "上传中…" : "本地上传"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void onUploadImage(file);
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

          <div className="space-y-2.5 rounded-xl border border-border/75 bg-surface-subtle/50 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-medium text-foreground">
                立即启用展示
              </span>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-muted-foreground">
                在创作工作台展示
              </span>
              <Switch
                checked={form.show_image}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, show_image: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-muted-foreground">
                在登录页展示
              </span>
              <Switch
                checked={form.show_login}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, show_login: checked }))
                }
              />
            </div>
            {form.display_mode === "popup" ? (
              <div className="flex items-center justify-between gap-3 border-t border-border/65 pt-2.5">
                <span className="text-[12.5px] font-medium text-status-warning">
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
        open={confirmDiscardOpen}
        tone="warning"
        title="放弃未保存的公告草稿？"
        description="关闭抽屉将丢失当前填写或修改的公告内容。"
        confirmLabel="放弃修改"
        cancelLabel="继续编辑"
        onClose={() => setConfirmDiscardOpen(false)}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onForceClose();
        }}
      />
    </>
  );
}
