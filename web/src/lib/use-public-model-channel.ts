import { useEffect, useMemo, useState } from "react";

import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  IMAGE_CREATION_MODEL_OPTIONS,
  VIDEO_CREATION_MODEL_OPTIONS,
  isChatModel,
  isImageCreationModel,
  isVideoCreationModel,
  filterStudioImageModelIds,
  normalizeChatModelId,
  type ImageModel,
} from "@/lib/api";
import { fetchModelCatalog, type ModelCatalogResponse } from "@/lib/register-cpa-proxy-api";
import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";
import type { ImageChannelType } from "@/lib/image-channel-api";
import { clearModelCatalogCache, readModelCatalogCache, writeModelCatalogCache } from "@/lib/model-catalog-cache";
import { normalizePublicImageChannelModels } from "@/lib/model-catalog-normalizers";

type PublicModelChannelSetting = {
  availableModels: string[];
  defaultModel: string;
  defaultImageModel: string;
  defaultTextModel: string;
  systemPrompt: string;
  allowCustomChannel: boolean;
};

type ModelOption = {
  id: string;
  value: ImageModel;
  label: string;
  channelModelId?: string;
  channelName?: string;
  channelAlias?: string;
  channelType?: ImageChannelType;
  creditCost?: number;
  creditCosts?: Record<string, number>;
  capabilities?: string[];
  resolutions?: string[];
};

/**
 * Studio channel allow-list (static fallback).
 * Dynamic catalog from GET /api/model-catalog is merged on top when available.
 */
const ACCOUNT_POOL_MODEL_CHANNEL: PublicModelChannelSetting = {
  availableModels: [
    "auto",
    "gpt-4.5",
    "gpt-4o",
    "gpt-5",
    "gpt-5-1",
    "gpt-5-2",
    "gpt-5-3",
    "gpt-5-3-mini",
    "gpt-5-5",
    "gpt-5-6",
    "gpt-5-6-sol",
    "gpt-5-6-terra",
    "gpt-5-6-luna",
    "gpt-5-mini",
    "gpt-image-2.5",
    "gpt-image-2.5-flare",
    "grok-imagine-image",
    "grok-imagine-video",
    "grok-4.5",
    "grok-4.20-fast",
    "grok-4.20-auto",
    "grok-4.20-expert",
    "grok-4.20-0309-super",
  ],
  defaultModel: "auto",
  defaultImageModel: DEFAULT_IMAGE_MODEL,
  defaultTextModel: DEFAULT_CHAT_MODEL,
  systemPrompt: "",
  allowCustomChannel: false,
};

const MODEL_CATALOG_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const initialCatalogCache = typeof window !== "undefined" ? readModelCatalogCache<ModelCatalogResponse>(window.localStorage) : null;
let sharedCatalog: ModelCatalogResponse | null = initialCatalogCache ? normalizeCatalog(initialCatalogCache.catalog) : null;
let sharedCatalogStoredAt = initialCatalogCache?.storedAt || 0;
let sharedCatalogPromise: Promise<ModelCatalogResponse | null> | null = null;
let sharedCatalogError: string | null = null;
const MODEL_CATALOG_UPDATED_EVENT = "studio:model-catalog-updated";

function normalizeCatalog(catalog: ModelCatalogResponse): ModelCatalogResponse {
  return {
    ...catalog,
    chat_models: normalizeList(catalog.chat_models),
    image_models: normalizeList(catalog.image_models),
    image_edit_models: normalizeList(catalog.image_edit_models),
    video_models: normalizeList(catalog.video_models),
    all_models: normalizeList(catalog.all_models),
    image_channel_models: normalizePublicImageChannelModels(catalog.image_channel_models),
  };
}

function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const value = normalizeChatModelId(String(item || "").trim());
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

async function loadSharedCatalog(force = false): Promise<ModelCatalogResponse | null> {
  const cacheFresh = sharedCatalog && Date.now() - sharedCatalogStoredAt < MODEL_CATALOG_CACHE_MAX_AGE_MS;
  if (!force && cacheFresh) return sharedCatalog;
  if (!force && sharedCatalogPromise) return sharedCatalogPromise;
  sharedCatalogPromise = (async () => {
    try {
      const catalog = await fetchModelCatalog();
      sharedCatalog = normalizeCatalog(catalog);
      sharedCatalogStoredAt = Date.now();
      if (typeof window !== "undefined") writeModelCatalogCache(window.localStorage, sharedCatalog, sharedCatalogStoredAt);
      sharedCatalogError = null;
      return sharedCatalog;
    } catch (error) {
      sharedCatalogError = error instanceof Error ? error.message : "model catalog load failed";
      return sharedCatalog;
    } finally {
      sharedCatalogPromise = null;
    }
  })();
  return sharedCatalogPromise;
}

/**
 * Drop the cached catalog (module singleton + persisted copy) without notifying mounted
 * consumers: used when the auth session changes, where kicking off new requests is not wanted.
 */
export function forgetPublicModelChannelCache() {
  sharedCatalog = null;
  sharedCatalogStoredAt = 0;
  sharedCatalogPromise = null;
  sharedCatalogError = null;
  if (typeof window !== "undefined") {
    clearModelCatalogCache(window.localStorage);
  }
}

export function resetPublicModelChannelCache() {
  forgetPublicModelChannelCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MODEL_CATALOG_UPDATED_EVENT));
  }
}

// The catalog carries per-session channel names / aliases / credit costs, so another account
// logging in on the same browser must never read the previous session's cached catalog.
if (typeof window !== "undefined") {
  window.addEventListener(AUTH_SESSION_CHANGE_EVENT, forgetPublicModelChannelCache);
}

function labelFor(model: string, fallbackLabel?: string): string {
  const fromCatalog =
    CHAT_MODEL_OPTIONS.find((o) => o.value === model)?.label ||
    IMAGE_CREATION_MODEL_OPTIONS.find((o) => o.value === model)?.label ||
    VIDEO_CREATION_MODEL_OPTIONS.find((o) => o.value === model)?.label;
  return fromCatalog || fallbackLabel || model;
}

function mergeOptions(
  fallback: ReadonlyArray<{ value: ImageModel; label: string }>,
  filter: (value: string) => boolean,
  dynamicIds: string[],
): ModelOption[] {
  const seen = new Set<string>();
  const out: ModelOption[] = [];
  const preferred = dynamicIds.length
    ? dynamicIds
    : ACCOUNT_POOL_MODEL_CHANNEL.availableModels;

  for (const raw of preferred) {
    const model = normalizeChatModelId(raw);
    if (!filter(model) || seen.has(model)) continue;
    seen.add(model);
    out.push({ id: model, value: model, label: labelFor(model) });
  }
  for (const option of fallback) {
    const model = normalizeChatModelId(option.value);
    if (!filter(model) || seen.has(model)) continue;
    seen.add(model);
    out.push({ id: model, value: model, label: labelFor(model, option.label) });
  }
  return out;
}

function decorateModelOptions(options: ModelOption[], defaultModel: string): ModelOption[] {
  return options.map((option) =>
    option.value === defaultModel ? { ...option, label: `${option.label}（默认）` } : option,
  );
}

function channelImageOptions(catalog: ModelCatalogResponse | null): ModelOption[] {
  const models = normalizePublicImageChannelModels(catalog?.image_channel_models);
  return models
    .filter((model) => model.capabilities.includes("generate"))
    .map((model) => ({
      id: model.id,
      value: model.upstream_model,
      label: model.display_name,
      channelModelId: model.id,
      channelName: model.channel_name,
      channelAlias: model.channel_alias,
      channelType: model.channel_type,
      creditCost: model.credit_cost,
      creditCosts: model.credit_costs,
      capabilities: model.capabilities,
      resolutions: model.resolutions,
    }));
}

export function usePublicModelChannel() {
  const [catalog, setCatalog] = useState<ModelCatalogResponse | null>(sharedCatalog);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    sharedCatalog ? "ready" : "idle",
  );

  useEffect(() => {
    let cancelled = false;
    setStatus(sharedCatalog ? "ready" : "loading");
    const applyCatalog = (result: ModelCatalogResponse | null) => {
      if (cancelled) return;
      setCatalog(result);
      setStatus(result ? "ready" : sharedCatalogError ? "error" : "ready");
    };
    const load = (force = false) => {
      if (!sharedCatalog) setStatus("loading");
      void loadSharedCatalog(force).then(applyCatalog);
    };
    load(!sharedCatalog || Date.now() - sharedCatalogStoredAt >= MODEL_CATALOG_CACHE_MAX_AGE_MS);
    const handleCatalogUpdated = () => load(true);
    window.addEventListener(MODEL_CATALOG_UPDATED_EVENT, handleCatalogUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(MODEL_CATALOG_UPDATED_EVENT, handleCatalogUpdated);
    };
  }, []);

  return useMemo(() => {
    const dynamicChat = normalizeList(catalog?.chat_models);
    const dynamicImage = normalizeList(catalog?.image_models);
    const dynamicVideo = normalizeList(catalog?.video_models);
    // Studio image menu keeps all GPT Images Web aliases plus the canonical Grok entry.
    const dynamicAvailable = Array.from(
      new Set([...dynamicChat, ...dynamicImage, ...dynamicVideo, ...ACCOUNT_POOL_MODEL_CHANNEL.availableModels]),
    );

    const channel: PublicModelChannelSetting = {
      ...ACCOUNT_POOL_MODEL_CHANNEL,
      availableModels: dynamicAvailable,
    };

    const filteredDynamicImage = filterStudioImageModelIds(dynamicImage);
    const configuredImageOptions = channelImageOptions(catalog);
    const rawImageModelOptions = configuredImageOptions.length ? configuredImageOptions : mergeOptions(
      IMAGE_CREATION_MODEL_OPTIONS, isImageCreationModel,
      filteredDynamicImage.length ? filteredDynamicImage : channel.availableModels,
    );
    const rawChatModelOptions = mergeOptions(
      CHAT_MODEL_OPTIONS,
      isChatModel,
      dynamicChat.length ? dynamicChat : channel.availableModels,
    );
    const videoModelOptions = mergeOptions(
      VIDEO_CREATION_MODEL_OPTIONS,
      isVideoCreationModel,
      dynamicVideo.length ? dynamicVideo : channel.availableModels,
    );
    const defaultImageModel = rawImageModelOptions.some((option) => option.value === channel.defaultImageModel)
      ? channel.defaultImageModel
      : rawImageModelOptions[0]?.value || DEFAULT_IMAGE_MODEL;
    const defaultTextModel = rawChatModelOptions.some((option) => option.value === channel.defaultTextModel)
      ? channel.defaultTextModel
      : rawChatModelOptions[0]?.value || DEFAULT_CHAT_MODEL;

    return {
      settings: channel,
      imageModelOptions: rawImageModelOptions,
      videoModelOptions,
      chatModelOptions: decorateModelOptions(rawChatModelOptions, defaultTextModel),
      defaultImageModel,
      defaultTextModel,
      systemPrompt: "",
      status,
      catalogSource: catalog?.source || null,
      catalogError: sharedCatalogError,
    };
  }, [catalog, status]);
}
