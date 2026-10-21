import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { DeleteImageTarget } from "@/app/image-manager/image-manager-types";
import { downloadManagedImage, downloadManagedImages } from "@/app/image-manager/image-manager-utils";
import {
  deleteManagedImages,
  updateManagedImageVisibility,
  type ImageVisibility,
  type ManagedImage,
} from "@/lib/api";
import { clearImageManagerCache, removeCachedManagedImages, updateImageManagerCache } from "@/lib/image-manager-cache";
import { isImageDownloadCanceled, MAX_IMAGE_BATCH_DOWNLOAD_ITEMS } from "@/lib/image-download";
import type { ImageGalleryView } from "@/lib/image-manager-cache";

type UseImageManagerMutationsOptions = {
  items: ManagedImage[];
  setItems: Dispatch<SetStateAction<ManagedImage[]>>;
  currentCacheKey: string;
  galleryView: ImageGalleryView;
  canDeleteImages: boolean;
  removeSelectedPaths: (paths: string[]) => void;
  closeLightbox: () => void;
};

export function useImageManagerMutations({
  items,
  setItems,
  currentCacheKey,
  galleryView,
  canDeleteImages,
  removeSelectedPaths,
  closeLightbox,
}: UseImageManagerMutationsOptions) {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteImageTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [visibilityMutatingPath, setVisibilityMutatingPath] = useState<string | null>(null);

  const downloadItems = useCallback(async (key: string, downloadItems: ManagedImage[]) => {
    if (downloadItems.length === 0 || downloadingKey) return;
    if (downloadItems.length > MAX_IMAGE_BATCH_DOWNLOAD_ITEMS) {
      toast.error(`单次最多下载 ${MAX_IMAGE_BATCH_DOWNLOAD_ITEMS} 张图片`);
      return;
	}
	setDownloadingKey(key);
	const toastId = `image-manager-download:${key}`;
	try {
		if (downloadItems.length === 1) {
			await downloadManagedImage(downloadItems[0], items.indexOf(downloadItems[0]));
			toast.success("图片已开始下载", { id: toastId });
		} else {
			toast.loading("请选择保存文件夹，随后将逐张写入原图", { id: toastId });
			const result = await downloadManagedImages(downloadItems, items, ({ completed, total }) => {
				toast.loading(`正在保存原图 ${completed}/${total}`, { id: toastId });
			});
			if (result.failed.length > 0) {
				toast.error(`已处理 ${result.total} 张：成功 ${result.completed} 张，失败 ${result.failed.length} 张`, { id: toastId });
			} else {
				toast.success(
					result.mode === "directory"
						? `已保存 ${result.completed} 张原图`
						: `已提交 ${result.completed} 张原图下载`,
					{ id: toastId },
				);
			}
		}
	} catch (error) {
		if (isImageDownloadCanceled(error)) {
			toast.info("已取消选择保存文件夹", { id: toastId });
		} else {
			toast.error(error instanceof Error ? error.message : "下载图片失败", { id: toastId });
		}
	} finally {
      setDownloadingKey(null);
    }
  }, [downloadingKey, items]);

  const openDeleteConfirm = useCallback((targetItems: ManagedImage[]) => {
    if (!canDeleteImages) return;
    const paths = Array.from(new Set(targetItems.map((item) => item.path)));
    if (paths.length === 0) {
      toast.error("没有可删除的图片");
      return;
    }
    setDeleteTarget({ paths });
  }, [canDeleteImages]);

  const handleConfirmDelete = useCallback(async () => {
    if (!canDeleteImages || !deleteTarget || isDeleting) return;
    const paths = deleteTarget.paths;
    const pathSet = new Set(paths);
    setIsDeleting(true);
    try {
      const data = await deleteManagedImages(paths);
      removeCachedManagedImages(paths);
      setItems((current) => current.filter((item) => !pathSet.has(item.path)));
      removeSelectedPaths(paths);
      closeLightbox();
      setDeleteTarget(null);
      toast.success(data.missing > 0
        ? `已删除 ${data.deleted} 张图片，${data.missing} 张已不存在`
        : `已删除 ${data.deleted} 张图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除图片失败");
    } finally {
      setIsDeleting(false);
    }
  }, [canDeleteImages, closeLightbox, deleteTarget, isDeleting, removeSelectedPaths, setItems]);

  const handleVisibilityChange = useCallback(async (item: ManagedImage, visibility: ImageVisibility) => {
    if (galleryView !== "mine" || visibilityMutatingPath) return;
    if (item.visibility === visibility) return;
    setVisibilityMutatingPath(item.path);
    try {
      const data = await updateManagedImageVisibility(item.path, visibility);
      const updated = { ...data.item, path: item.path, visibility: data.item.visibility || visibility };
      clearImageManagerCache();
      setItems((current) => {
        const next = current.map((currentItem) => currentItem.path === item.path ? { ...currentItem, ...updated } : currentItem);
        updateImageManagerCache(currentCacheKey, next);
        return next;
      });
      toast.success(visibility === "public" ? "已公开到公开图库" : "已取消公开");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新公开状态失败");
    } finally {
      setVisibilityMutatingPath(null);
    }
  }, [currentCacheKey, galleryView, setItems, visibilityMutatingPath]);

  const handleBulkVisibilityChange = useCallback(async (targetItems: ManagedImage[], visibility: ImageVisibility) => {
    if (galleryView !== "mine" || visibilityMutatingPath) return;
    const pendingItems = targetItems.filter((item) => item.visibility !== visibility);
    if (pendingItems.length === 0) return;
    setVisibilityMutatingPath(`bulk:${visibility}`);
    try {
      const results = await Promise.allSettled(pendingItems.map(async (item) => {
        const data = await updateManagedImageVisibility(item.path, visibility);
        return { ...data.item, path: item.path, visibility: data.item.visibility || visibility };
      }));
      const updates = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failedCount = results.length - updates.length;
      if (updates.length > 0) {
        const updatesByPath = new Map(updates.map((item) => [item.path, item]));
        clearImageManagerCache();
        setItems((current) => {
          const next = current.map((currentItem) => {
            const updated = updatesByPath.get(currentItem.path);
            return updated ? { ...currentItem, ...updated } : currentItem;
          });
          updateImageManagerCache(currentCacheKey, next);
          return next;
        });
      }
      if (failedCount > 0) {
        toast.error(`已更新 ${updates.length} 张图片，${failedCount} 张失败`);
        return;
      }
      toast.success(visibility === "public"
        ? `已公开 ${updates.length} 张图片`
        : `已设为私有 ${updates.length} 张图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量更新公开状态失败");
    } finally {
      setVisibilityMutatingPath(null);
    }
  }, [currentCacheKey, galleryView, setItems, visibilityMutatingPath]);

  return {
    downloadingKey,
    deleteTarget,
    isDeleting,
    visibilityMutatingPath,
    isMutatingImages: downloadingKey !== null || isDeleting || visibilityMutatingPath !== null,
    setDeleteTarget,
    downloadItems,
    openDeleteConfirm,
    handleConfirmDelete,
    handleVisibilityChange,
    handleBulkVisibilityChange,
  };
}
