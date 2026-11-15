import type { DeleteImageTarget } from "@/app/image-manager/image-manager-types";
import { MediaDeleteDialog } from "@/components/media-delete-dialog";

type ImageManagerDeleteDialogProps = {
  open: boolean;
  target: DeleteImageTarget | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ImageManagerDeleteDialog({
  open,
  target,
  isDeleting,
  onClose,
  onConfirm,
}: ImageManagerDeleteDialogProps) {
  return (
    <MediaDeleteDialog
      open={open && Boolean(target)}
      mediaLabel="图片"
      count={target?.paths.length || 0}
      detail="这会同时移除图片原图、缩略图及对应索引，删除后不可恢复。"
      isDeleting={isDeleting}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
