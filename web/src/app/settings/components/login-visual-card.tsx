"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Sparkles,
  Upload,
  Zap,
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
    label: "默认暖调粒子球舞台",
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

const PREVIEW_CHANNELS = [
  { label: "GPT 号池", icon: Layers },
  { label: "Grok 渠道", icon: Zap },
  { label: "登录即用", icon: Sparkles },
] as const;

export function LoginVisualCard({
  hideFooter = false,
}: {
  hideFooter?: boolean;
}) {
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
    label: "登录页品牌视觉",
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
      toast.error("自定义画作不能超过 10MB，超大图请填写外部 CDN/R2 链接");
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
      title="登录页品牌视觉配置"
      description="配置登录页右侧品牌视觉舞台：留空展示默认暖奶油色（#fff7ed）粒子球舞台，或上传最高 10MB 自定义展示画作（右上角 11:9 悬浮卡片）并微调构图。"
      meta={
        <Badge variant="outline" className="rounded-md font-normal">
          {pendingFile
            ? "待保存本地画作"
            : effectiveImageUrl
              ? "自定义悬浮画作"
              : "默认暖调粒子球舞台"}
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
        !hideFooter && (expanded || isDirty) ? (
          <SettingsCardSaveFooter
            dirty={isDirty}
            saving={isSaving}
            hint="保存后自动落盘静态文件并更新登录页右侧品牌舞台视觉，无需重启服务"
            onReset={() => resetConfigSection(LOGIN_VISUAL_KEYS)}
            onSave={() => void handleSave()}
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            快捷视觉预设：
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
                  自定义悬浮画作地址（支持上传 ≤10MB 本地图片，留空仅展示默认暖调粒子球舞台）
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
                    placeholder="https://example.com/showcase.webp 或点击右侧上传本地图片"
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
                <div className="space-y-3 rounded-[10px] border border-border/70 bg-surface-subtle/45 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      铺展模式
                    </span>
                    <SubNav
                      size="sm"
                      ariaLabel="登录页悬浮画作铺展模式"
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
                  当前未指定右上角悬浮展示画作，登录页右侧将完整呈现暖奶油色（#fff7ed）动态粒子球舞台与品牌标语。
                </p>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-amber-200/75 bg-surface-subtle/50 p-3 dark:border-amber-900/35">
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-mono uppercase tracking-wider">
                  LOGIN STAGE PREVIEW {effectiveImageUrl ? "(11:9 CARD)" : "(SPHERE)"}
                </span>
                <span>
                  {effectiveImageUrl
                    ? `${mode.toUpperCase()} · ${zoom.toFixed(1)}x`
                    : "WARM SPHERE STAGE"}
                </span>
              </div>

              <div className="relative flex min-h-[240px] flex-col justify-end overflow-hidden rounded-2xl border border-[#dfe7f1] bg-[#fff7ed] p-4 text-stone-900 dark:border-amber-900/40 dark:bg-[#1a120e] dark:text-amber-50">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_38%_34%,rgba(251,191,36,0.24),transparent_56%),radial-gradient(circle_at_70%_78%,rgba(249,115,22,0.12),transparent_52%)] dark:bg-[radial-gradient(circle_at_38%_34%,rgba(251,191,36,0.15),transparent_56%),radial-gradient(circle_at_70%_78%,rgba(180,83,9,0.14),transparent_52%)]" />

                {/* Stylized warm particle-sphere motif mirroring HeroSphereCanvas */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-5 left-5 size-36 rounded-full border border-dashed border-amber-500/35 bg-[radial-gradient(circle_at_35%_35%,rgba(251,191,36,0.34),rgba(245,158,11,0.08)_62%,transparent_76%)] shadow-[inset_0_0_24px_rgba(245,158,11,0.16)]"
                >
                  <div className="absolute inset-3.5 rounded-full border border-dotted border-orange-500/30" />
                  <div className="absolute inset-8 rounded-full border border-amber-500/25 bg-amber-400/10" />
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#fff7ed] via-[#fff7ed]/82 to-transparent dark:from-[#1a120e] dark:via-[#1a120e]/86" />

                {effectiveImageUrl ? (
                  <div className="absolute top-3.5 right-3.5 z-[2] aspect-[11/9] w-36 overflow-hidden rounded-2xl border border-white/65 shadow-[0_14px_32px_rgba(120,53,15,0.18)] dark:border-amber-900/45">
                    <LoginPageImageStage
                      src={effectiveImageUrl}
                      mode={mode}
                      zoom={zoom}
                      positionX={posX}
                      positionY={posY}
                      fillParent
                      frameClassName="rounded-2xl"
                      imageClassName="rounded-2xl"
                    />
                  </div>
                ) : null}

                <div className="relative z-[2] mt-auto flex flex-col gap-1.5 pt-16">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200/90 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900/80 dark:border-amber-800/50 dark:bg-amber-950/55 dark:text-amber-100/80">
                    <Sparkles className="size-3 text-amber-500" />
                    AI Image Studio
                  </span>
                  <p className="text-base font-semibold tracking-tight">
                    多模型生图工作台
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {PREVIEW_CHANNELS.map(({ label, icon: Icon }) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-stone-600 dark:border-amber-900/45 dark:bg-stone-950/55 dark:text-amber-100/70"
                      >
                        <Icon className="size-2.5 text-amber-500" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}
