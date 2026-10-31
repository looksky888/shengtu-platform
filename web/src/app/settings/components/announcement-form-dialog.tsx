import { useRef } from "react";
import { BellRing, Eye, ImagePlus, Save, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { settingsRasterImageAccept } from "./settings-raster-image";
import {
  SettingsSwitchRow,
  settingsDialogInputClassName,
} from "./settings-ui";
import type { AnnouncementsCardState } from "./use-announcements-card";

export function AnnouncementFormDialog({
  state,
}: {
  state: AnnouncementsCardState;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageUrl = state.form.image_url.trim();
  const isBusy = state.isSaving || state.isUploadingImage;
  const broadcastActive = Boolean(state.form.enabled && state.form.broadcast_now);

  return (
    <Dialog
      open={state.dialogOpen}
      onOpenChange={(nextOpen) => {
        if (!isBusy) state.setDialogOpen(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={!isBusy}
        className="max-h-[88vh] overflow-y-auto rounded-xl p-6 sm:max-w-2xl"
      >
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle>
            {state.editingItem ? "编辑站内公告" : "发布站内公告"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5 sm:text-sm">
            配置弹窗标题、正文与配图，支持保存后实时向所有当前在线的用户页面发起全员弹窗。
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="announcement-title">公告标题</FieldLabel>
            <Input
              id="announcement-title"
              value={state.form.title}
              disabled={state.isSaving}
              onChange={(event) =>
                state.updateForm({ title: event.target.value })
              }
              placeholder="例如：v5.2 创作工作台升级通知"
              className={cn("h-9", settingsDialogInputClassName)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="announcement-content">公告正文</FieldLabel>
            <Textarea
              id="announcement-content"
              value={state.form.content}
              disabled={state.isSaving}
              onChange={(event) =>
                state.updateForm({ content: event.target.value })
              }
              placeholder="输入需要展示给用户的详细说明（支持多行换行）…"
              className={cn("min-h-36 leading-6", settingsDialogInputClassName)}
            />
            <FieldDescription>
              保存前会自动去除首尾空白字符，正文内容不能为空。
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="announcement-image-file">
              公告横幅配图（可选）
            </FieldLabel>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border/80 bg-surface-subtle/45 p-4">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="公告图片预览"
                  className="max-h-56 w-full rounded-lg bg-surface-muted/60 object-contain ring-1 ring-border/75"
                />
              ) : (
                <div className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-lg bg-surface text-xs text-muted-foreground ring-1 ring-border/70">
                  <ImagePlus className="size-5 text-muted-foreground/70" />
                  <span>
                    暂未上传配图（预览比例与前台弹窗一致，完整显示不裁切）
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  id="announcement-image-file"
                  type="file"
                  accept={settingsRasterImageAccept}
                  className="hidden"
                  disabled={isBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    void state.handleImageUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={state.isUploadingImage}
                  disabled={state.isSaving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {!state.isUploadingImage ? (
                    <Upload className="size-3.5" />
                  ) : null}
                  {imageUrl ? "更换图片" : "上传图片"}
                </Button>
                {imageUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => state.updateForm({ image_url: "" })}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    移除配图
                  </Button>
                ) : null}
              </div>
            </div>
            <FieldDescription>
              支持 JPEG / PNG / GIF / WebP，文件将托管至服务端{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">
                data/announcement_images
              </code>{" "}
              目录。
            </FieldDescription>
          </Field>

          <div className="space-y-2.5">
            <div className="text-xs font-medium text-foreground sm:text-[13px]">
              发布状态与触达范围
            </div>
            <SettingsSwitchRow
              size="sm"
              title="立即启用公告"
              description="开启后前台将按下方勾选的页面位置展示此通知"
              checked={state.form.enabled}
              disabled={state.isSaving}
              onCheckedChange={(checked) =>
                state.updateForm({ enabled: checked })
              }
            />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <SettingsSwitchRow
                size="sm"
                title="登录页展示"
                description="访客打开登录或注册页面时触达"
                checked={state.form.show_login}
                disabled={state.isSaving}
                onCheckedChange={(checked) =>
                  state.updateForm({ show_login: checked })
                }
              />
              <SettingsSwitchRow
                size="sm"
                title="创作工作台展示"
                description="已登录用户在生图、视频、画廊等工作台触达"
                checked={state.form.show_image}
                disabled={state.isSaving}
                onCheckedChange={(checked) =>
                  state.updateForm({ show_image: checked })
                }
              />
            </div>

            <SettingsSwitchRow
              size="sm"
              title="保存后立即向所有在线用户发起弹窗"
              description={
                state.form.enabled
                  ? "开启后将通过实时通道秒级唤醒所有在线页面弹出此公告，并忽略旧版本的「今日不再提醒」"
                  : "需先开启「立即启用公告」后方可使用实时全员弹窗推送"
              }
              checked={broadcastActive}
              disabled={state.isSaving || !state.form.enabled}
              onCheckedChange={(checked) =>
                state.updateForm({ broadcast_now: checked })
              }
              className={cn(
                broadcastActive &&
                  "border-amber-500/35 bg-amber-500/8 dark:border-amber-400/30 dark:bg-amber-400/8",
              )}
            />
          </div>
        </FieldGroup>

        <DialogFooter className="border-t border-border/60 pt-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy || !state.form.content.trim()}
            onClick={state.openDraftPreview}
          >
            <Eye className="size-3.5" />
            预览弹窗效果
          </Button>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => state.setDialogOpen(false)}
              disabled={isBusy}
            >
              取消
            </Button>
            <Button
              type="button"
              loading={state.isSaving}
              disabled={state.isUploadingImage}
              onClick={() => void state.handleSave()}
            >
              {!state.isSaving ? (
                broadcastActive ? (
                  <BellRing className="size-4" />
                ) : (
                  <Save className="size-4" />
                )
              ) : null}
              {state.editingItem
                ? broadcastActive
                  ? "保存并全员弹窗"
                  : "保存修改"
                : broadcastActive
                  ? "发布并全员弹窗"
                  : "发布公告"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
