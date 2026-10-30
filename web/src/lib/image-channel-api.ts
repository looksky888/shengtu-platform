import {
  normalizeImageChannelModel,
  normalizeImageChannelModels,
} from "@/lib/model-catalog-normalizers";
import { httpRequest } from "@/lib/request";

export type ImageChannelType = "account_pool" | "openai_compatible" | "grok_runtime";
export type ImageCapability = "generate" | "edit";

export type ImageChannel = {
  id: string;
  name: string;
  alias?: string;
  type: ImageChannelType;
  base_url?: string;
  enabled: boolean;
  system: boolean;
  sort: number;
  max_concurrency: number;
  timeout_seconds: number;
  max_retries: number;
  download_urls: boolean;
  api_key_configured: boolean;
  api_key_masked?: string;
  model_count: number;
  enabled_models: number;
};

export type ImageChannelInput = {
  name: string;
  alias: string;
  type: ImageChannelType;
  base_url: string;
  api_key: string;
  clear_api_key?: boolean;
  enabled: boolean;
  sort: number;
  max_concurrency: number;
  timeout_seconds: number;
  max_retries: number;
  download_urls: boolean;
};

export type ImageChannelModel = {
  id: string;
  channel_id: string;
  display_name: string;
  upstream_model: string;
  capabilities: ImageCapability[];
  resolutions?: string[];
  formats?: string[];
  credit_cost: number;
  credit_costs?: Record<string, number>;
  enabled: boolean;
  sort: number;
};

export type ImageChannelModelInput = Omit<ImageChannelModel, "id" | "channel_id">;

export type PublicImageChannelModel = Omit<ImageChannelModel, "enabled"> & {
  channel_name: string;
  channel_alias?: string;
  channel_type: ImageChannelType;
  channel_sort: number;
};

const channelPath = (channelId: string) =>
  `/api/admin/image-channels/${encodeURIComponent(channelId)}`;

export const fetchImageChannels = () =>
  httpRequest<{ channels: ImageChannel[] }>("/api/admin/image-channels");

export const createImageChannel = (input: ImageChannelInput) =>
  httpRequest<ImageChannel>("/api/admin/image-channels", { method: "POST", body: input });

export const updateImageChannel = (id: string, input: ImageChannelInput) =>
  httpRequest<ImageChannel>(channelPath(id), { method: "PUT", body: input });

export const deleteImageChannel = (id: string) =>
  httpRequest<void>(channelPath(id), { method: "DELETE" });

export const fetchImageChannelModels = async (channelId: string) => {
  const response = await httpRequest<{ models: ImageChannelModel[] | null }>(
    `${channelPath(channelId)}/models`,
  );
  return {
    models: normalizeImageChannelModels(response?.models),
  };
};

export const createImageChannelModel = async (
  channelId: string,
  input: ImageChannelModelInput,
) => {
  const created = await httpRequest<ImageChannelModel>(
    `${channelPath(channelId)}/models`,
    { method: "POST", body: input },
  );
  return normalizeImageChannelModel(created);
};

export const updateImageChannelModel = async (
  channelId: string,
  modelId: string,
  input: ImageChannelModelInput,
) => {
  const updated = await httpRequest<ImageChannelModel>(
    `${channelPath(channelId)}/models/${encodeURIComponent(modelId)}`,
    { method: "PUT", body: input },
  );
  return normalizeImageChannelModel(updated);
};

export const deleteImageChannelModel = (channelId: string, modelId: string) =>
  httpRequest<void>(`${channelPath(channelId)}/models/${encodeURIComponent(modelId)}`, { method: "DELETE" });

export const discoverImageChannelModels = (channelId: string) =>
  httpRequest<{ models: string[] }>(`${channelPath(channelId)}/discover`, { method: "POST", body: {} });
