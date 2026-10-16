import { LoaderCircle, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProfileApiKeyDialogsProps = {
  keyName: string;
  isGenerating: boolean;
  isDeleting: boolean;
  isRotateDialogOpen: boolean;
  isDeleteDialogOpen: boolean;
  onRotateOpenChange: (open: boolean) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onGenerate: () => void;
  onDelete: () => void;
};

export function ProfileApiKeyDialogs({
  keyName,
  isGenerating,
  isDeleting,
  isRotateDialogOpen,
  isDeleteDialogOpen,
  onRotateOpenChange,
  onDeleteOpenChange,
  onGenerate,
  onDelete,
}: ProfileApiKeyDialogsProps) {
  return (
    <>
      <Dialog open={isRotateDialogOpen} onOpenChange={onRotateOpenChange}>
        <DialogContent className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-[#1456f0]" />
              重新生成密钥
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              重新生成后旧密钥将立即失效，请确认当前调用方已经准备好更新到新密钥。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => onRotateOpenChange(false)} disabled={isGenerating}>
              取消
            </Button>
            <Button type="button" className="h-10 rounded-xl px-5" onClick={onGenerate} disabled={isGenerating}>
              {isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={onDeleteOpenChange}>
        <DialogContent className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>删除密钥</DialogTitle>
            <DialogDescription className="text-sm leading-6">确认删除「{keyName || "我的 API 令牌"}」吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => onDeleteOpenChange(false)} disabled={isDeleting}>
              取消
            </Button>
            <Button type="button" variant="destructive" className="h-10 rounded-xl px-5" onClick={onDelete} disabled={isDeleting}>
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
