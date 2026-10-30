"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { isConfigKeysDirty } from "@/app/settings/settings-dirty";
import { useRegisterSettingsDirty } from "@/app/settings/settings-dirty-registry-hooks";
import { useSettingsStore } from "@/app/settings/store";
import { LoginPageImageStage } from "@/components/login-page-image-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubNav } from "@/components/ui/sub-nav";
import {
  LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM,
  normalizeLoginPageImageMode,
  type LoginPageImageMode,
} from "@/lib/login-page-image-layout";

import {
  isSettingsRasterImage,
  settingsRasterImageAccept,
} from "./settings-raster-image";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  settingsInputClassName,
} from "./settings-ui";

const LOGIN_VISUAL_KEYS = [
  "login_page_image_url",
  "login_page_image_mode",
  "login_page_image_zoom",
  "login_page_image_position_x",
  "login_page_image_position_y",
] as const;

const MAX_LOGIN_POSTER_BYTES = 10 * 1024 * 1024;

const PRESET_GALLERY_ITEMS = [
  {
    label: "默认暗房三联画",
    url: "",
  },
  {
    label: "东方高定胶片",
    url: "/presets/editorial-fashion.webp",
  },
  {
    label: "曜石星穹拱门",
    url: "/presets/stellar-poster.webp",
  },
  {
    label: "青花典藏器物",
    url: "/presets/qinghua-museum-infographic.webp",
  },
  {
    label: "滨海雨夜超跑",
    url: "/presets/forza-horizon-shenzhen.webp",
  },
] as const;

const MODE_ITEMS: ReadonlyArray<{ value: LoginPageImageMode; label: string }> = [
  { value: "cover", label: "裁切铺满" },
  { value: "contain", label: "完整留白" },
  { value: "fill", label: "拉伸填充" },
];

export function LoginVisualCard() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const pendingFile = useSettingsStore(
    (state) => state.pendingLoginImageFile
  );
  const pendingPreviewUrl = useSettingsStore(
    (state) => state.pendingLoginImagePreviewUrl
  );
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const isSavingAll = useSettingsStore(
    (state) => state.isSavingConfig && state.savingSectionKey === "__all__"
  );
  const saveLoginPageVisual = useSettingsStore(
    (state) => state.saveLoginPageVisual
  );
  const stageLoginPageImageFile = useSettingsStore(
    (state) => state.stageLoginPageImageFile
  );
  const discardPendingLoginPageImage = useSettingsStore(
    (state) => state.discardPendingLoginPageImage
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );
  const setLoginPageVisualField = useSettingsStore(
    (state) => state.setLoginPageVisualField
  );

  const imageUrl = String(config?.login_page_image_url || "").trim();
  const effectiveImageUrl = pendingPreviewUrl || imageUrl;
  const mode = normalizeLoginPageImageMode(config?.login_page_image_mode);
  const zoom = Number(config?.login_page_image_zoom) || 1;
  const posX = Number(config?.login_page_image_position_x ?? 50);
  const posY = Number(config?.login_page_image_position_y ?? 50);

  const [expanded, setExpanded] = useState<boolean>(() => Boolean(imageUrl));

  const isDirty =
    Boolean(pendingFile) ||
    isConfigKeysDirty(config, savedConfigSnapshot, LOGIN_VISUAL_KEYS);
  const isSaving = savingSectionKey === "login_visual" || isSavingAll;

  useRegisterSettingsDirty({
    id: "config:login-visual",
    tab: "base",
    label: "登录页海报展示",
    isDirty,
    save: async () => {
      const currentState = useSettingsStore.getState();
      const stillDirty =
        Boolean(currentState.pendingLoginImageFile) ||
        isConfigKeysDirty(
          currentState.config,
          currentState.savedConfigSnapshot,
          LOGIN_VISUAL_KEYS
        );
      if (!stillDirty) return true;
      return saveLoginPageVisual({ sectionKey: "login_visual" });
    },
    discard: () => {
      discardPendingLoginPageImage();
      return true;
    },
  });

  if (!config) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isSettingsRasterImage(file)) {
      toast.error("请选择 JPG、PNG、WEBP 或 GIF 格式的图片");
      return;
    }
    if (file.size > MAX_LOGIN_POSTER_BYTES) {
      toast.error("自定义海报不能超过 10MB，超大图请填写外部 CDN/R2 链接");
      return;
    }
    stageLoginPageImageFile(file);
    setExpanded(true);
  };

  const restoreDefaultGallery = () => {
    setLoginPageVisualField({
      login_page_image_url: "",
      login_page_image_mode: "contain",
      login_page_image_zoom: LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM.zoom,
      login_page_image_position_x: LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM.positionX,
      login_page_image_position_y: LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM.positionY,
    });
  };

  const handleSave = async () => {
    await saveLoginPageVisual({ sectionKey: "login_visual" });
  };

  return (
    <SettingsCard
      icon={ImageIcon}
      title="登录页画廊海报配置"
      description="配置登录页左侧视觉展板：留空使用内置暗房三联画廊，或上传最高 10MB 自定义典藏海报（自动存盘至静态目录）并微调构图。"
      meta={
        <Badge variant="outline" className="rounded-md font-normal">
          {pendingFile
            ? "待保存本地海报"
            : effectiveImageUrl
              ? "自定义海报"
              : "默认暗房三联画"}
        </Badge>
      }
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded((prev) => !prev)}
          className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
        >
          <span>{expanded ? "收起画幅调节" : "展开画幅调节"}</span>
          {expanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </Button>
      }
      footer={
        expanded || isDirty ? (
          <SettingsCardSaveFooter
            dirty={isDirty}
            saving={isSaving}
            hint="保存后自动落盘静态文件并更新登录页视觉，无需重启服务"
            onReset={() => resetConfigSection(LOGIN_VISUAL_KEYS)}
            onSave={() => void handleSave()}
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            快捷画廊预设：
          </span>
          {PRESET_GALLERY_ITEMS.map((preset) => {
            const selected = !pendingFile && imageUrl === preset.url;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  if (!preset.url) {
                    restoreDefaultGallery();
                  } else {
                    setLoginPageVisualField({
                      login_page_image_url: preset.url,
                      login_page_image_mode: "cover",
                    });
                    setExpanded(true);
                  }
                }}
                className={`inline-flex h-7.5 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                  selected
                    ? "border-foreground bg-foreground text-background shadow-2xs"
                    : "border-border/80 bg-surface-subtle/60 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                {!preset.url ? <Sparkles className="size-3" /> : null}
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        {expanded ? (
          <div className="grid gap-5 border-t border-border/60 pt-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="login-page-image-url-input"
                  className="text-xs font-medium text-foreground sm:text-[13px]"
                >
                  自定义海报地址（支持上传 ≤10MB 本地图片，留空恢复默认暗房三联画）
                </label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="login-page-image-url-input"
                    value={
                      pendingFile
                        ? `[待上传文件] ${pendingFile.name} (${(pendingFile.size / 1024).toFixed(0)} KB)`
                        : imageUrl.startsWith("data:")
                          ? "[历史内联图片，建议重新上传或恢复默认]"
                          : imageUrl
                    }
                    readOnly={Boolean(pendingFile) || imageUrl.startsWith("data:")}
                    onChange={(event) =>
                      setLoginPageVisualField({
                        login_page_image_url: event.target.value,
                      })
                    }
                    placeholder="https://example.com/poster.webp 或点击右侧上传本地图片"
                    className={`min-w-[200px] flex-1 ${settingsInputClassName}`}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={settingsRasterImageAccept}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 gap-1.5 rounded-lg px-3 text-xs"
                  >
                    <Upload className="size-3.5" />
                    <span>上传本地图片</span>
                  </Button>
                  {effectiveImageUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={restoreDefaultGallery}
                      className="h-9 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                      <span>恢复默认</span>
                    </Button>
                  ) : null}
                </div>
              </div>

              {effectiveImageUrl ? (
                <div className="space-y-3 rounded-xl border border-border/70 bg-surface-subtle/45 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      铺展模式
                    </span>
                    <SubNav
                      size="sm"
                      ariaLabel="登录页海报铺展模式"
                      layoutId="login-visual-mode-subnav"
                      value={mode}
                      items={MODE_ITEMS}
                      onValueChange={(next) =>
                        setLoginPageVisualField({ login_page_image_mode: next })
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1 text-xs">
                      <span className="flex justify-between text-muted-foreground">
                        <span>缩放倍率</span>
                        <span className="font-mono text-foreground tabular-nums">
                          {zoom.toFixed(2)}x
                        </span>
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={zoom}
                        onChange={(event) =>
                          setLoginPageVisualField({
                            login_page_image_zoom: Number(event.target.value),
                          })
                        }
                        className="w-full accent-foreground"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="flex justify-between text-muted-foreground">
                        <span>水平焦点</span>
                        <span className="font-mono text-foreground tabular-nums">
                          {Math.round(posX)}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={posX}
                        onChange={(event) =>
                          setLoginPageVisualField({
                            login_page_image_position_x: Number(
                              event.target.value
                            ),
                          })
                        }
                        className="w-full accent-foreground"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="flex justify-between text-muted-foreground">
                        <span>垂直焦点</span>
                        <span className="font-mono text-foreground tabular-nums">
                          {Math.round(posY)}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={posY}
                        onChange={(event) =>
                          setLoginPageVisualField({
                            login_page_image_position_y: Number(
                              event.target.value
                            ),
                          })
                        }
                        className="w-full accent-foreground"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  当前未指定单张覆盖图，登录页左侧将自动展示精调的「Shengtu
                  Studio 暗房三联典藏画廊」。
                </p>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#0c0c0e] p-3 text-zinc-200">
              <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-400">
                <span className="font-mono uppercase tracking-wider">
                  LOGIN STAGE PREVIEW (4:5)
                </span>
                <span>
                  {effectiveImageUrl
                    ? `${mode.toUpperCase()} · ${zoom.toFixed(1)}x`
                    : "DEFAULT GALLERY"}
                </span>
              </div>
              {effectiveImageUrl ? (
                <LoginPageImageStage
                  src={effectiveImageUrl}
                  mode={mode}
                  zoom={zoom}
                  positionX={posX}
                  positionY={posY}
                  className="mx-auto max-w-[270px]"
                  frameClassName="aspect-[4/5] rounded-lg border border-white/10 bg-black/50"
                />
              ) : (
                <div className="mx-auto grid aspect-[4/5] w-full max-w-[270px] grid-cols-3 gap-1.5 overflow-hidden rounded-lg border border-white/10 bg-zinc-950 p-1.5">
                  <img
                    src="/presets/editorial-fashion.webp"
                    alt=""
                    className="h-full w-full rounded object-cover"
                  />
                  <img
                    src="/presets/stellar-poster.webp"
                    alt=""
                    className="h-full w-full rounded object-cover"
                  />
                  <img
                    src="/presets/forza-horizon-shenzhen.webp"
                    alt=""
                    className="h-full w-full rounded object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}
