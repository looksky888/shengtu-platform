"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Images,
  LayoutGrid,
  LoaderCircle,
  Plus,
  Proportions,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AssetsBatchBar } from "@/app/assets/assets-batch-bar";
import {
  getAssetsTypeTabOptions,
  isImageExpiringSoon,
  isImageRetentionExpired,
  parseAssetsScope,
  parseAssetsTypeTab,
  parseAssetTimestamp,
  resolveAssetOrientation,
  type AssetsOrientationFilter,
  type AssetsScope,
  type AssetsTypeTab,
  type AssetsVisibilityFilter,
} from "@/app/assets/assets-cloud-policy";
import { AssetsFilterSidebar } from "@/app/assets/assets-filter-sidebar";
import {
  AssetsImageCard,
  AssetsVideoCard,
  type UnifiedAssetItem,
} from "@/app/assets/assets-media-card";
import { AssetsVipStatusMobilePill } from "@/app/assets/assets-vip-status-card";
import { preloadRoute } from "@/app/route-prefetch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { useImageConversationsForQueue } from "@/components/image-task-queue-utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SubNav } from "@/components/ui/sub-nav";
import {
  VideoPreviewDialog,
  type VideoPreview,
} from "@/components/video-preview-dialog";
import type { ImageVisibility, ManagedImage } from "@/lib/api-types";
import { copyText } from "@/lib/clipboard";
import {
  imageDownloadFileName,
  triggerImageDownload,
} from "@/lib/image-download";
import {
  deleteManagedImages,
  fetchManagedImages,
  updateManagedImageVisibility,
} from "@/lib/settings-api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  fetchPaymentConfig,
  type PaymentConfig,
} from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";
import {
  deleteVideoAsset,
  fetchVideoAssets,
  updateVideoVisibility,
  videoDownloadURL,
  type VideoAsset,
} from "@/lib/video-task-api";
import { canAccessPath, hasAPIPermission } from "@/store/auth";

const PAGE_LIMIT = 60;
const ASSETS_NATURAL_ASPECT_KEY = "shengtu:assets:natural-aspect";

function extractImageLookupKeys(path?: string, url?: string): string[] {
  const keys: string[] = [];
  if (path?.trim()) {
    keys.push(path.trim().replace(/^\/+/, ""));
  }
  if (url?.trim()) {
    const cleanUrl = url.split(/[?#]/, 1)[0]?.trim() || "";
    if (cleanUrl) {
      keys.push(cleanUrl);
      const afterImages = cleanUrl.replace(/^.*\/images\//, "");
      if (afterImages && afterImages !== cleanUrl) {
        try {
          keys.push(decodeURIComponent(afterImages));
        } catch {
          keys.push(afterImages);
        }
      }
    }
  }
  return keys;
}

export default function AssetsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/assets");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversations = useImageConversationsForQueue();
  const isAdmin = session?.role === "admin";

  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const cloudStorageEnabled = Boolean(paymentConfig?.cloud_storage_enabled);
  const entitlement = paymentConfig?.storage_entitlement ?? null;
  const freeRetentionDays = paymentConfig?.free_retention_days ?? 3;
  const vipGraceDays = paymentConfig?.vip_grace_days ?? 7;

  const activeType = parseAssetsTypeTab(
    searchParams.get("type"),
    cloudStorageEnabled,
  );
  const scope = parseAssetsScope(
    searchParams.get("view") || searchParams.get("scope"),
    isAdmin,
  );

  const [visibilityFilter, setVisibilityFilter] =
    useState<AssetsVisibilityFilter>("all");
  const [orientationFilter, setOrientationFilter] =
    useState<AssetsOrientationFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [naturalAspect, setNaturalAspect] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(ASSETS_NATURAL_ASPECT_KEY) === "1";
    } catch {
      return false;
    }
  });

  const handleSetNaturalAspect = useCallback((next: boolean) => {
    setNaturalAspect(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          ASSETS_NATURAL_ASPECT_KEY,
          next ? "1" : "0",
        );
      } catch {
        // Ignore storage restrictions.
      }
    }
  }, []);

  const [images, setImages] = useState<ManagedImage[]>([]);
  const loadSeqRef = useRef(0);
  const batchDownloadTimersRef = useRef<number[]>([]);
  const [imageCursor, setImageCursor] = useState("");
  const [imageHasMore, setImageHasMore] = useState(false);

  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [videoCursor, setVideoCursor] = useState("");
  const [videoHasMore, setVideoHasMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [mutatingKeys, setMutatingKeys] = useState<Record<string, boolean>>({});
  const [failedImagePaths, setFailedImagePaths] = useState<
    Record<string, boolean>
  >({});
  const [pendingDeleteItems, setPendingDeleteItems] = useState<
    UnifiedAssetItem[] | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const canReadImages = Boolean(
    session && hasAPIPermission(session, "GET", "/api/images"),
  );
  const canReadVideos = Boolean(
    session && hasAPIPermission(session, "GET", "/api/videos"),
  );
  const canReadPaymentConfig = Boolean(
    session && hasAPIPermission(session, "GET", "/api/payment/config"),
  );
  const canAccessImage = Boolean(session && canAccessPath(session, "/image"));
  const canAccessVideo = Boolean(session && canAccessPath(session, "/video"));
  const canOpenWallet = Boolean(session && canAccessPath(session, "/wallet"));

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [previewVideo, setPreviewVideo] = useState<{
    preview: VideoPreview;
    downloadName: string;
  } | null>(null);

  const localPromptByImage = useMemo(() => {
    const map = new Map<string, string>();
    for (const conv of conversations) {
      for (const turn of conv.turns) {
        const turnPrompt = (turn.prompt || "").trim();
        for (const storedImg of turn.images || []) {
          const promptValue =
            turnPrompt || (storedImg.revised_prompt || "").trim();
          if (!promptValue) continue;
          for (const key of extractImageLookupKeys(
            storedImg.path,
            storedImg.url,
          )) {
            if (!map.has(key)) {
              map.set(key, promptValue);
            }
          }
        }
      }
    }
    return map;
  }, [conversations]);

  const loadPaymentPolicy = useCallback(async () => {
    if (!canReadPaymentConfig) return;
    try {
      const cfg = await fetchPaymentConfig();
      setPaymentConfig(cfg);
    } catch {
      // Keep default cloud_storage_enabled = false if payment config endpoint fails.
    }
  }, [canReadPaymentConfig]);

  const loadAssets = useCallback(
    async (targetScope: AssetsScope, silent = false) => {
      const requestSeq = ++loadSeqRef.current;
      if (!silent) setLoading(true);
      try {
        const emptyImages = {
          items: [] as ManagedImage[],
          groups: [],
          total: 0,
          has_more: false,
          next_cursor: "",
          limit: PAGE_LIMIT,
        };
        const emptyVideos = {
          items: [] as VideoAsset[],
          total: 0,
          has_more: false,
          next_cursor: "",
          limit: PAGE_LIMIT,
          scope: targetScope,
        };
        const [imgRes, vidRes] = await Promise.all([
          canReadImages
            ? fetchManagedImages({ scope: targetScope, limit: PAGE_LIMIT }).catch(
                () => emptyImages,
              )
            : Promise.resolve(emptyImages),
          canReadVideos
            ? fetchVideoAssets(targetScope, { limit: PAGE_LIMIT }).catch(
                () => emptyVideos,
              )
            : Promise.resolve(emptyVideos),
        ]);
        if (requestSeq !== loadSeqRef.current) return;
        setImages(imgRes.items);
        setImageCursor(imgRes.next_cursor || "");
        setImageHasMore(Boolean(imgRes.has_more));

        setVideos(vidRes.items);
        setVideoCursor(vidRes.next_cursor || "");
        setVideoHasMore(Boolean(vidRes.has_more));
        setSelectedKeys({});
        setFailedImagePaths({});
      } finally {
        if (!silent && requestSeq === loadSeqRef.current) setLoading(false);
      }
    },
    [canReadImages, canReadVideos],
  );

  useEffect(() => {
    if (!session) return;
    void loadPaymentPolicy();
  }, [loadPaymentPolicy, session]);

  useEffect(() => {
    if (!session) return;
    const effectiveScope: AssetsScope =
      activeType === "expiring" ? "mine" : scope;
    void loadAssets(effectiveScope);
  }, [activeType, loadAssets, scope, session]);

  const handleLoadMore = async () => {
    if (loadingMore) return;
    const effectiveScope: AssetsScope =
      activeType === "expiring" ? "mine" : scope;
    setLoadingMore(true);
    try {
      const tasks: Promise<void>[] = [];
      if (
        canReadImages &&
        imageHasMore &&
        imageCursor &&
        (activeType === "all" ||
          activeType === "image" ||
          activeType === "expiring")
      ) {
        tasks.push(
          fetchManagedImages({
            scope: effectiveScope,
            limit: PAGE_LIMIT,
            cursor: imageCursor,
          }).then((res) => {
            setImages((prev) => {
              const seen = new Set(prev.map((i) => i.path));
              return [
                ...prev,
                ...res.items.filter((i) => !seen.has(i.path)),
              ];
            });
            setImageCursor(res.next_cursor || "");
            setImageHasMore(Boolean(res.has_more));
          }),
        );
      }
      if (
        canReadVideos &&
        videoHasMore &&
        videoCursor &&
        (activeType === "all" || activeType === "video")
      ) {
        tasks.push(
          fetchVideoAssets(effectiveScope, {
            limit: PAGE_LIMIT,
            cursor: videoCursor,
          }).then((res) => {
            setVideos((prev) => {
              const seen = new Set(prev.map((v) => v.id));
              return [...prev, ...res.items.filter((v) => !seen.has(v.id))];
            });
            setVideoCursor(res.next_cursor || "");
            setVideoHasMore(Boolean(res.has_more));
          }),
        );
      }
      const settled = await Promise.allSettled(tasks);
      const firstRejected = settled.find(
        (item): item is PromiseRejectedResult => item.status === "rejected",
      );
      if (firstRejected) {
        toast.error(
          firstRejected.reason instanceof Error
            ? firstRejected.reason.message
            : "部分素材加载失败，请重试",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载更多素材失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleTypeChange = (next: AssetsTypeTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "all") {
      nextParams.delete("type");
    } else {
      nextParams.set("type", next);
    }
    if (next === "expiring") {
      nextParams.delete("view");
      nextParams.delete("scope");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleScopeChange = (nextScope: AssetsScope) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("scope");
    if (nextScope === "mine") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", nextScope);
    }
    if (nextParams.get("type") === "expiring" && nextScope !== "mine") {
      nextParams.delete("type");
    }
    setSearchParams(nextParams, { replace: true });
    if (nextScope === "public") {
      setVisibilityFilter("all");
    }
  };

  const effectiveScope: AssetsScope =
    activeType === "expiring" ? "mine" : scope;
  const canManageScope =
    effectiveScope === "mine" || (isAdmin && effectiveScope === "all");
  const canDeleteImage =
    canManageScope &&
    Boolean(session && hasAPIPermission(session, "DELETE", "/api/images"));
  const canDeleteVideo =
    canManageScope &&
    Boolean(session && hasAPIPermission(session, "DELETE", "/api/videos"));
  const canUpdateImageVisibility =
    canManageScope &&
    Boolean(
      session && hasAPIPermission(session, "PATCH", "/api/images/visibility"),
    );
  const canUpdateVideoVisibility =
    canManageScope &&
    Boolean(
      session && hasAPIPermission(session, "PATCH", "/api/videos/visibility"),
    );

  const handleImageLoadError = useCallback((path: string) => {
    setFailedImagePaths((prev) =>
      prev[path] ? prev : { ...prev, [path]: true },
    );
  }, []);

  const isAssetImageUnavailable = useCallback(
    (img: ManagedImage) =>
      Boolean(failedImagePaths[img.path]) ||
      !img.url ||
      isImageRetentionExpired({
        cloudStorageEnabled,
        scope: effectiveScope,
        expiresAt: img.expires_at,
      }),
    [cloudStorageEnabled, effectiveScope, failedImagePaths],
  );

  const filteredItems = useMemo<UnifiedAssetItem[]>(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    const list: UnifiedAssetItem[] = [];

    if (activeType !== "video") {
      for (const img of images) {
        if (activeType === "expiring") {
          if (!cloudStorageEnabled || !isImageExpiringSoon(img.expires_at)) {
            continue;
          }
        }
        if (
          effectiveScope !== "public" &&
          visibilityFilter !== "all" &&
          img.visibility !== visibilityFilter
        ) {
          continue;
        }
        if (orientationFilter !== "all") {
          const orient = resolveAssetOrientation({
            orientation: img.orientation,
            width: img.width,
            height: img.height,
            size: img.requested_size || img.resolution,
            aspectRatio: img.aspect_ratio,
          });
          if (orient !== orientationFilter) continue;
        }

        const apiPrompt = (
          (img as ManagedImage & { prompt?: string }).prompt || ""
        ).trim();
        let resolvedPrompt = apiPrompt;
        if (!resolvedPrompt) {
          for (const key of extractImageLookupKeys(img.path, img.url)) {
            const found = localPromptByImage.get(key);
            if (found) {
              resolvedPrompt = found;
              break;
            }
          }
        }

        if (q) {
          const haystack = [
            resolvedPrompt,
            img.name,
            img.owner_name,
            img.resolution,
            img.requested_size,
            img.date,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase();
          if (!haystack.includes(q)) continue;
        }
        list.push({
          kind: "image",
          key: `img:${img.path}`,
          timestamp: parseAssetTimestamp(img.created_at || img.date),
          image: img,
          prompt: resolvedPrompt || undefined,
        });
      }
    }

    if (activeType === "all" || activeType === "video") {
      for (const vid of videos) {
        if (
          effectiveScope !== "public" &&
          visibilityFilter !== "all" &&
          vid.visibility !== visibilityFilter
        ) {
          continue;
        }
        if (orientationFilter !== "all") {
          const orient = resolveAssetOrientation({ size: vid.size });
          if (orient !== orientationFilter) continue;
        }
        if (q) {
          const haystack = [
            vid.prompt,
            vid.model,
            vid.owner_name,
            vid.task_id,
            vid.resolution_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase();
          if (!haystack.includes(q)) continue;
        }
        list.push({
          kind: "video",
          key: `vid:${vid.id}`,
          timestamp: parseAssetTimestamp(vid.created_at),
          video: vid,
        });
      }
    }

    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }, [
    activeType,
    cloudStorageEnabled,
    effectiveScope,
    images,
    localPromptByImage,
    orientationFilter,
    searchQuery,
    videos,
    visibilityFilter,
  ]);

  const visibleImages = useMemo(
    () =>
      filteredItems.filter(
        (item): item is Extract<UnifiedAssetItem, { kind: "image" }> =>
          item.kind === "image" && !isAssetImageUnavailable(item.image),
      ),
    [filteredItems, isAssetImageUnavailable],
  );

  const lightboxImages = useMemo<LightboxImage[]>(
    () =>
      visibleImages.map(({ image, prompt }) => ({
        id: image.path,
        src: image.url,
        alt: prompt || image.name,
        downloadName: image.name,
        width: image.width,
        height: image.height,
        format: image.output_format,
      })),
    [visibleImages],
  );

  const selectedItems = useMemo(
    () => filteredItems.filter((item) => selectedKeys[item.key]),
    [filteredItems, selectedKeys],
  );

  const downloadableSelectedItems = useMemo(
    () =>
      selectedItems.filter((item) =>
        item.kind === "image"
          ? !isAssetImageUnavailable(item.image)
          : Boolean(item.video.url),
      ),
    [isAssetImageUnavailable, selectedItems],
  );

  const updatableVisibilityItems = useMemo(
    () =>
      selectedItems.filter((item) =>
        item.kind === "image"
          ? canUpdateImageVisibility
          : canUpdateVideoVisibility,
      ),
    [canUpdateImageVisibility, canUpdateVideoVisibility, selectedItems],
  );

  const deletableSelectedItems = useMemo(
    () =>
      selectedItems.filter((item) =>
        item.kind === "image" ? canDeleteImage : canDeleteVideo,
      ),
    [canDeleteImage, canDeleteVideo, selectedItems],
  );

  const handleToggleSelect = (key: string) => {
    setSelectedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAllVisible = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedKeys({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const item of filteredItems) {
      next[item.key] = true;
    }
    setSelectedKeys(next);
  };

  const handleToggleSingleVisibility = async (
    item: UnifiedAssetItem,
    next: ImageVisibility,
  ) => {
    if (item.kind === "image" && !canUpdateImageVisibility) return;
    if (item.kind === "video" && !canUpdateVideoVisibility) return;
    setMutatingKeys((prev) => ({ ...prev, [item.key]: true }));
    try {
      if (item.kind === "image") {
        await updateManagedImageVisibility(item.image.path, next);
        setImages((prev) =>
          prev.map((img) =>
            img.path === item.image.path ? { ...img, visibility: next } : img,
          ),
        );
      } else {
        await updateVideoVisibility(item.video.id, next);
        setVideos((prev) =>
          prev.map((vid) =>
            vid.id === item.video.id ? { ...vid, visibility: next } : vid,
          ),
        );
      }
      toast.success(next === "public" ? "已公开到灵感库" : "已设为私密");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新公开状态失败");
    } finally {
      setMutatingKeys((prev) => ({ ...prev, [item.key]: false }));
    }
  };

  const handleBatchVisibility = async (next: ImageVisibility) => {
    if (updatableVisibilityItems.length === 0) return;
    const toastId = "assets-batch-visibility";
    toast.loading("正在批量更新公开状态…", { id: toastId });
    try {
      await Promise.all(
        updatableVisibilityItems.map((item) =>
          item.kind === "image"
            ? updateManagedImageVisibility(item.image.path, next)
            : updateVideoVisibility(item.video.id, next),
        ),
      );
      const selectedImgPaths = new Set(
        updatableVisibilityItems
          .filter(
            (i): i is Extract<UnifiedAssetItem, { kind: "image" }> =>
              i.kind === "image",
          )
          .map((i) => i.image.path),
      );
      const selectedVidIds = new Set(
        updatableVisibilityItems
          .filter(
            (i): i is Extract<UnifiedAssetItem, { kind: "video" }> =>
              i.kind === "video",
          )
          .map((i) => i.video.id),
      );
      setImages((prev) =>
        prev.map((img) =>
          selectedImgPaths.has(img.path) ? { ...img, visibility: next } : img,
        ),
      );
      setVideos((prev) =>
        prev.map((vid) =>
          selectedVidIds.has(vid.id) ? { ...vid, visibility: next } : vid,
        ),
      );
      toast.success(
        `已将 ${updatableVisibilityItems.length} 项素材设为${next === "public" ? "公开" : "私密"}`,
        { id: toastId },
      );
      setSelectedKeys({});
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "批量修改公开状态失败",
        { id: toastId },
      );
    }
  };

  useEffect(() => {
    return () => {
      loadSeqRef.current += 1;
      for (const timer of batchDownloadTimersRef.current) {
        window.clearTimeout(timer);
      }
      batchDownloadTimersRef.current = [];
    };
  }, []);

  const handleBatchDownload = () => {
    if (selectedItems.length === 0) return;
    if (downloadableSelectedItems.length === 0) {
      toast.warning("所选素材均已过期或不可用，无法下载");
      return;
    }
    const skippedCount = selectedItems.length - downloadableSelectedItems.length;
    downloadableSelectedItems.forEach((item, index) => {
      const timer = window.setTimeout(() => {
        if (item.kind === "image") {
          triggerImageDownload(
            item.image.url,
            imageDownloadFileName(item.image.url, item.image.name || "image"),
          );
        } else {
          const anchor = document.createElement("a");
          anchor.href = videoDownloadURL(item.video);
          anchor.download = `video-${item.video.task_id}.mp4`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }
      }, index * 180);
      batchDownloadTimersRef.current.push(timer);
    });
    toast.success(
      skippedCount > 0
        ? `已提交 ${downloadableSelectedItems.length} 项素材下载（已跳过 ${skippedCount} 项过期或不可用素材）`
        : `已提交 ${downloadableSelectedItems.length} 项素材下载`,
    );
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteItems || pendingDeleteItems.length === 0) return;
    setDeleting(true);
    try {
      const imgPaths = canDeleteImage
        ? pendingDeleteItems
            .filter(
              (i): i is Extract<UnifiedAssetItem, { kind: "image" }> =>
                i.kind === "image",
            )
            .map((i) => i.image.path)
        : [];
      const vidTasks = canDeleteVideo
        ? pendingDeleteItems
            .filter(
              (i): i is Extract<UnifiedAssetItem, { kind: "video" }> =>
                i.kind === "video",
            )
            .map((i) => i.video)
        : [];

      const deletedCount = imgPaths.length + vidTasks.length;
      if (deletedCount === 0) {
        setPendingDeleteItems(null);
        return;
      }

      if (canDeleteImage && imgPaths.length > 0) {
        await deleteManagedImages(imgPaths);
      }
      if (canDeleteVideo && vidTasks.length > 0) {
        await Promise.all(vidTasks.map((v) => deleteVideoAsset(v.task_id)));
      }

      const deletedImgSet = new Set(imgPaths);
      const deletedVidSet = new Set(vidTasks.map((v) => v.id));
      setImages((prev) => prev.filter((img) => !deletedImgSet.has(img.path)));
      setVideos((prev) => prev.filter((vid) => !deletedVidSet.has(vid.id)));
      setSelectedKeys({});
      toast.success(`已删除 ${deletedCount} 项素材`);
      setPendingDeleteItems(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除素材失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyPrompt = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await copyText(trimmed);
      toast.success("提示词已复制");
    } catch {
      toast.error("复制提示词失败");
    }
  }, []);

  const handleRemixImage = useCallback(
    (img: ManagedImage, promptText?: string) => {
      if (!canAccessImage || isAssetImageUnavailable(img)) return;
      preloadRoute("/image");
      navigate("/image", {
        state: {
          remixImageUrl: img.url,
          remixImageName: img.name,
          remixPrompt: promptText,
        },
      });
    },
    [canAccessImage, isAssetImageUnavailable, navigate],
  );

  const tabOptions = useMemo(
    () => getAssetsTypeTabOptions(cloudStorageEnabled),
    [cloudStorageEnabled],
  );

  const scopeOptions = useMemo(
    () =>
      [
        { value: "mine" as const, label: "我的创作" },
        { value: "public" as const, label: "公开灵感库" },
        ...(isAdmin ? [{ value: "all" as const, label: "全站资产" }] : []),
      ] as const,
    [isAdmin],
  );

  const orientationOptions = useMemo(
    () =>
      [
        { value: "all" as const, label: "全部" },
        { value: "landscape" as const, label: "横构图" },
        { value: "portrait" as const, label: "竖构图" },
        { value: "square" as const, label: "方构图" },
      ] as const,
    [],
  );

  const createHref =
    activeType === "video"
      ? canAccessVideo
        ? "/video"
        : canAccessImage
          ? "/image"
          : null
      : canAccessImage
        ? "/image"
        : canAccessVideo
          ? "/video"
          : null;
  const showLoadMore =
    (canReadImages &&
      imageHasMore &&
      (activeType === "all" ||
        activeType === "image" ||
        activeType === "expiring")) ||
    (canReadVideos &&
      videoHasMore &&
      (activeType === "all" || activeType === "video"));

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-5">
      {/* Top 52px Header + Desktop Underline Tabs */}
      <div className="flex flex-col gap-3 border-b border-border/65 pb-3 lg:pb-0">
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              素材云库
            </h1>
            <span className="rounded-full bg-surface px-2.5 py-0.5 font-mono text-xs text-muted-foreground tabular-nums dark:bg-[#17181c]">
              {filteredItems.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件名、提示词、模型或作者…"
                className="h-8 rounded-lg border-border/70 bg-surface pr-7 pl-8 text-xs dark:bg-[#17181c]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="清空搜索关键词"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            {/* Aspect Ratio Toggle: 统一网格 4:3 vs 自适应画幅 */}
            <div
              role="group"
              aria-label="网格画幅显示方式"
              className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-surface p-0.5 text-xs dark:bg-[#17181c]"
            >
              <button
                type="button"
                onClick={() => handleSetNaturalAspect(false)}
                title="统一网格 4:3"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-medium transition-colors",
                  !naturalAspect
                    ? "bg-foreground text-background font-semibold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">统一网格 4:3</span>
                <span className="sm:hidden">4:3</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetNaturalAspect(true)}
                title="自适应画幅"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-medium transition-colors",
                  naturalAspect
                    ? "bg-foreground text-background font-semibold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Proportions className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">自适应画幅</span>
                <span className="sm:hidden">自适应</span>
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                void loadPaymentPolicy();
                void loadAssets(effectiveScope);
              }}
              className="h-8 bg-surface dark:bg-[#17181c]"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">刷新</span>
            </Button>

            {createHref ? (
              <Button asChild size="sm" className="h-8 rounded-lg font-semibold">
                <Link to={createHref} onMouseEnter={() => preloadRoute(createHref)}>
                  <Plus className="size-3.5" />
                  <span>去创作</span>
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {/* Desktop White-Underline Tabs */}
        <SubNav
          items={tabOptions}
          value={activeType}
          onValueChange={handleTypeChange}
          variant="underline"
          layoutId="assets-type-tabs"
          className="hidden border-b-0 lg:flex"
        />

        {/* Mobile Compact Horizontal Filter Bar (<lg) */}
        <div className="flex flex-col gap-2 lg:hidden">
          <div className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto">
            {tabOptions.map((tab) => {
              const active = activeType === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => handleTypeChange(tab.value)}
                  className={cn(
                    "inline-flex h-7.5 shrink-0 items-center rounded-full px-3 text-xs transition-colors",
                    active
                      ? "bg-foreground font-semibold text-background shadow-2xs"
                      : "border border-border/70 bg-surface font-medium text-muted-foreground hover:text-foreground dark:bg-[#17181c]",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}

            <AssetsVipStatusMobilePill
              cloudStorageEnabled={cloudStorageEnabled}
              entitlement={entitlement}
              freeRetentionDays={freeRetentionDays}
              vipGraceDays={vipGraceDays}
              canOpenWallet={canOpenWallet}
            />
          </div>

          <div className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto">
            {scopeOptions.map((opt) => {
              const active = effectiveScope === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={activeType === "expiring" && opt.value !== "mine"}
                  onClick={() => handleScopeChange(opt.value)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    active
                      ? "bg-foreground/[0.12] font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}

            <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border/70" />

            {orientationOptions
              .filter((opt) => opt.value !== "all")
              .map((opt) => {
                const active = orientationFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setOrientationFilter(active ? "all" : opt.value)
                    }
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] transition-colors",
                      active
                        ? "bg-foreground/[0.12] font-semibold text-foreground"
                        : "font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* 220px Sticky Left Filter Column (Desktop lg+) + Right Media Grid */}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <AssetsFilterSidebar
          cloudStorageEnabled={cloudStorageEnabled}
          entitlement={entitlement}
          freeRetentionDays={freeRetentionDays}
          vipGraceDays={vipGraceDays}
          canOpenWallet={canOpenWallet}
          activeType={activeType}
          effectiveScope={effectiveScope}
          scopeOptions={scopeOptions}
          visibilityFilter={visibilityFilter}
          orientationFilter={orientationFilter}
          orientationOptions={orientationOptions}
          onScopeChange={handleScopeChange}
          onVisibilityChange={setVisibilityFilter}
          onOrientationChange={setOrientationFilter}
        />

        {/* Right Media Content Area */}
        <section className="flex min-w-0 flex-col gap-4">
          <AssetsBatchBar
            selectedCount={selectedItems.length}
            totalFilteredCount={filteredItems.length}
            downloadableCount={downloadableSelectedItems.length}
            updatableVisibilityCount={updatableVisibilityItems.length}
            deletableCount={deletableSelectedItems.length}
            onSelectAllVisible={handleSelectAllVisible}
            onBatchDownload={handleBatchDownload}
            onBatchVisibility={(next) => void handleBatchVisibility(next)}
            onRequestBatchDelete={() => setPendingDeleteItems(deletableSelectedItems)}
          />

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center gap-2 rounded-xl bg-surface p-8 text-xs text-muted-foreground dark:bg-[#17181c]">
              <LoaderCircle className="size-4 animate-spin" />
              <span>正在同步云端素材资产…</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={Images}
              title={
                activeType === "expiring"
                  ? "暂无即将过期的云端图片"
                  : searchQuery
                    ? "未找到匹配的素材"
                    : "当前分类下暂无素材资产"
              }
              description={
                activeType === "expiring"
                  ? "你名下的图片目前均在安全留存期内。"
                  : "前往多模态创作台生成高清视觉作品或分镜视频，结果将自动归档至此。"
              }
              action={
                createHref ? (
                  <Button asChild size="sm">
                    <Link to={createHref}>
                      <Plus className="size-3.5" />
                      <span>前往创作工作台</span>
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div
                className={cn(
                  naturalAspect
                    ? "columns-1 gap-3.5 space-y-3.5 sm:columns-2 md:columns-3 xl:columns-4"
                    : "grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
                )}
              >
                {filteredItems.map((item) =>
                  item.kind === "image" ? (
                    <AssetsImageCard
                      key={item.key}
                      item={item}
                      scope={effectiveScope}
                      cloudStorageEnabled={cloudStorageEnabled}
                      canDelete={canDeleteImage}
                      canToggleVisibility={canUpdateImageVisibility}
                      selected={Boolean(selectedKeys[item.key])}
                      mutating={Boolean(mutatingKeys[item.key])}
                      naturalAspect={naturalAspect}
                      resolvedPrompt={item.prompt}
                      onToggleSelect={handleToggleSelect}
                      onPreviewImage={(img) => {
                        if (isAssetImageUnavailable(img)) return;
                        const idx = visibleImages.findIndex(
                          (entry) => entry.image.path === img.path,
                        );
                        if (idx < 0) return;
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }}
                      onToggleVisibility={(target, next) =>
                        void handleToggleSingleVisibility(target, next)
                      }
                      onRequestDelete={(target) =>
                        setPendingDeleteItems([target])
                      }
                      onCopyPrompt={(text) => void handleCopyPrompt(text)}
                      onRemixImage={canAccessImage ? handleRemixImage : undefined}
                      onImageLoadError={handleImageLoadError}
                    />
                  ) : (
                    <AssetsVideoCard
                      key={item.key}
                      item={item}
                      scope={effectiveScope}
                      canDelete={canDeleteVideo}
                      canToggleVisibility={canUpdateVideoVisibility}
                      selected={Boolean(selectedKeys[item.key])}
                      mutating={Boolean(mutatingKeys[item.key])}
                      naturalAspect={naturalAspect}
                      onToggleSelect={handleToggleSelect}
                      onPreviewVideo={(vid) =>
                        setPreviewVideo({
                          preview: {
                            url: vid.url,
                            prompt: vid.prompt,
                            seconds: vid.seconds,
                            resolution: vid.resolution_name,
                            size: vid.size,
                          },
                          downloadName: `video-${vid.task_id}.mp4`,
                        })
                      }
                      onToggleVisibility={(target, next) =>
                        void handleToggleSingleVisibility(target, next)
                      }
                      onRequestDelete={(target) =>
                        setPendingDeleteItems([target])
                      }
                      onCopyPrompt={(text) => void handleCopyPrompt(text)}
                    />
                  ),
                )}
              </div>

              {showLoadMore ? (
                <div className="flex justify-center pt-2 pb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                    className="bg-surface dark:bg-[#17181c]"
                  >
                    {loadingMore ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : null}
                    <span>{loadingMore ? "加载中…" : "加载更多素材"}</span>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />

      <VideoPreviewDialog
        variant="studio"
        video={previewVideo?.preview ?? null}
        downloadName={previewVideo?.downloadName}
        onOpenChange={(open) => {
          if (!open) setPreviewVideo(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteItems && pendingDeleteItems.length > 0)}
        title="确认删除所选素材？"
        description={`即将永久移除 ${pendingDeleteItems?.length ?? 0} 项云端素材资产，删除后无法恢复。`}
        confirmLabel="确认删除"
        destructive
        pending={deleting}
        onClose={() => setPendingDeleteItems(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
