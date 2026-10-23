import type { RefObject } from "react";

import { ImageEditBasicFields } from "@/app/image/components/edit-dialog/image-edit-basic-fields";
import { ImageEditOutputFields } from "@/app/image/components/edit-dialog/image-edit-output-fields";
import { ImageEditReferencePanel } from "@/app/image/components/edit-dialog/image-edit-reference-panel";
import { ImageEditSizeFields } from "@/app/image/components/edit-dialog/image-edit-size-fields";
import type {
  ModelOption,
  ReferenceImageLightboxHandler,
  SetEditingTurnDraft,
} from "@/app/image/components/edit-dialog/types";
import type { EditingTurnDraft } from "@/app/image/lib/image-page-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ImageEditDialogProps = {
  draft: EditingTurnDraft | null;
  setDraft: SetEditingTurnDraft;
  editFileInputRef: RefObject<HTMLInputElement | null>;
  imageModelOptions: ModelOption[];
  chatModelOptions: ModelOption[];
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
  onRemoveReferenceImage: (index: number) => void;
  onOpenLightbox: ReferenceImageLightboxHandler;
  onSave: (regenerate: boolean) => void | Promise<void>;
};

export function ImageEditDialog({
  draft,
  setDraft,
  editFileInputRef,
  imageModelOptions,
  chatModelOptions,
  onReferenceImageChange,
  onRemoveReferenceImage,
  onOpenLightbox,
  onSave,
}: ImageEditDialogProps) {
  if (!draft) {
    return null;
  }

  const modelOptions = draft.mode === "chat" ? chatModelOptions : imageModelOptions;

  return (
    <Dialog open onOpenChange={(open) => (!open ? setDraft(null) : null)}>
      <DialogContent className="flex max-h-[88dvh] w-[min(92vw,640px)] flex-col overflow-hidden rounded-xl p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{draft.mode === "chat" ? "编辑对话" : "编辑生成设置"}</DialogTitle>
          <DialogDescription>
            {draft.mode === "chat" ? "修改本轮消息和对话模型。" : "修改本轮提示词、参考图和生成参数。"}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-5">
            <ImageEditBasicFields draft={draft} setDraft={setDraft} modelOptions={modelOptions} />
            <ImageEditReferencePanel
              draft={draft}
              editFileInputRef={editFileInputRef}
              onReferenceImageChange={onReferenceImageChange}
              onRemoveReferenceImage={onRemoveReferenceImage}
              onOpenLightbox={onOpenLightbox}
            />
            {draft.mode !== "chat" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ImageEditSizeFields draft={draft} setDraft={setDraft} />
                <ImageEditOutputFields draft={draft} setDraft={setDraft} />
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button variant="outline" onClick={() => setDraft(null)}>
            取消
          </Button>
          <Button variant="outline" onClick={() => void onSave(false)}>
            保存
          </Button>
          <Button onClick={() => void onSave(true)}>
            {draft.mode === "chat" ? "保存并重新发送" : "保存并重新生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
