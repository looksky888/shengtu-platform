import { useRef } from "react";
import { LoaderCircle, Save, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { settingsDialogInputClassName, settingsToggleClassName } from "./settings-ui";
import { settingsRasterImageAccept } from "./settings-raster-image";
import type { AnnouncementsCardState } from "./use-announcements-card";

export function AnnouncementFormDialog({ state }: { state: AnnouncementsCardState }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageUrl = state.form.image_url.trim();

  return (
    <Dialog open={state.dialogOpen} onOpenChange={state.setDialogOpen}>
      <DialogContent className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>{state.editingItem ? "编辑公告" : "添加公告"}</DialogTitle>
          <DialogDescription className="text-sm leading-6">公告内容会按勾选位置显示给对应页面的用户。</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="announcement-title">标题</FieldLabel>
            <Input id="announcement-title" value={state.form.title} onChange={(event) => state.updateForm({ title: event.target.value })} placeholder="公告" className={settingsDialogInputClassName} />
          </Field>
          <Field>
            <FieldLabel htmlFor="announcement-content">内容</FieldLabel>
            <Textarea id="announcement-content" value={state.form.content} onChange={(event) => state.updateForm({ content: event.target.value })} placeholder="填写公告内容" className="min-h-36 bg-background" />
            <FieldDescription>保存前会去除首尾空白，内容不能为空。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="announcement-image-file">公告图片</FieldLabel>
            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4">
              {imageUrl ? <img src={imageUrl} alt="公告图片预览" className="max-h-56 w-full rounded-2xl object-cover ring-1 ring-border" /> : <div className="flex min-h-28 items-center justify-center rounded-2xl bg-background text-sm text-muted-foreground ring-1 ring-border">暂未上传公告图片</div>}
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileInputRef} id="announcement-image-file" type="file" accept={settingsRasterImageAccept} className="hidden" disabled={state.isUploadingImage} onChange={(event) => { const file = event.target.files?.[0]; void state.handleImageUpload(file); event.currentTarget.value = ""; }} />
                <Button type="button" variant="outline" disabled={state.isUploadingImage} onClick={() => fileInputRef.current?.click()}>
                  {state.isUploadingImage ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}上传图片
                </Button>
                {imageUrl ? <Button type="button" variant="secondary" onClick={() => state.updateForm({ image_url: "" })}>清除图片</Button> : null}
              </div>
            </div>
            <FieldDescription>图片会上传到本项目 data/announcement_images 下，不需要手动填写 URL。</FieldDescription>
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <ToggleRow checked={state.form.enabled} onChange={(checked) => state.updateForm({ enabled: checked })} label="启用公告" />
            <ToggleRow checked={state.form.show_login} onChange={(checked) => state.updateForm({ show_login: checked })} label="登录页显示" />
            <ToggleRow checked={state.form.show_image} onChange={(checked) => state.updateForm({ show_image: checked })} label="创作台显示" />
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="secondary" size="lg" onClick={() => state.setDialogOpen(false)} disabled={state.isSaving}>取消</Button>
          <Button type="button" size="lg" onClick={() => void state.handleSave()} disabled={state.isSaving}>
            {state.isSaving ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className={settingsToggleClassName}><Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />{label}</label>;
}
