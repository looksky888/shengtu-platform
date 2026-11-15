import type { ModelPricingRow } from "@/app/profile/profile-api-docs-catalog";
import type { CreationPricing } from "@/lib/api";
import type { PublicImageChannelModel } from "@/lib/image-channel-api";

export const DEFAULT_MODEL_PRICING_ROWS: ReadonlyArray<ModelPricingRow> = [
  {
    model: "gpt-image-2.6-flare",
    recommended: true,
    price: "5 积分/张",
    capabilities: "支持文生图、参考图改图、直出 GIF 动图",
  },
  {
    model: "gpt-image-2.6",
    price: "5 积分/张",
    capabilities: "支持文生图、改图、GIF 动图",
  },
  {
    model: "gpt-image-2.6-sunburst",
    price: "5 积分/张",
    capabilities: "支持文生图、改图、GIF 动图",
  },
  {
    model: "gpt-image-2.5-flare / gpt-image-2.5-sunburst",
    price: "3 积分/张",
    capabilities: "高清静态图 PNG / JPEG / WebP",
  },
  {
    model: "gpt-image-2.5",
    price: "2 积分/张",
    capabilities: "标准静态图 PNG / JPEG / WebP",
  },
  {
    model: "gpt-image-2",
    price: "1 积分/张",
    capabilities: "轻量快速静态图 PNG / JPEG / WebP",
  },
  {
    model: "grok-imagine-image",
    price: "1K 1 积分 / 2K 2 积分",
    capabilities: "Grok 生图与参考图改图",
  },
  {
    model: "grok-imagine-video",
    price: "1 积分/秒",
    capabilities: "Grok 视频生成（支持首帧参考图）",
  },
];

const BUILTIN_PRICING_MODEL_IDS = new Set([
  "gpt-image-2.6-flare",
  "gpt-image-2.6",
  "gpt-image-2.6-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5",
  "gpt-image-2",
  "grok-imagine-image",
  "grok-imagine-video",
]);

function positiveCost(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function formatChannelModelPrice(model: PublicImageChannelModel): string {
  const tierEntries = Object.entries(model.credit_costs ?? {}).filter(
    ([, cost]) => Number.isFinite(Number(cost)) && Number(cost) > 0,
  );
  if (tierEntries.length > 0) {
    const uniqueCosts = new Set(tierEntries.map(([, cost]) => Number(cost)));
    if (uniqueCosts.size === 1) {
      const [singleCost] = [...uniqueCosts];
      return `${singleCost} 积分/张`;
    }
    return tierEntries
      .map(([tier, cost]) => `${tier.toUpperCase()} ${Number(cost)} 积分`)
      .join(" / ");
  }
  const baseCost = positiveCost(model.credit_cost, 1);
  return `${baseCost} 积分/张`;
}

function formatChannelModelCapabilities(model: PublicImageChannelModel): string {
  const caps: string[] = ["支持文生图"];
  if (model.capabilities?.includes("edit")) {
    caps.push("参考图改图");
  }
  if (model.formats?.some((fmt) => fmt.toLowerCase() === "gif")) {
    caps.push("GIF 动图");
  }
  const channelLabel = (model.channel_alias || model.channel_name || "").trim();
  return channelLabel ? `${caps.join("、")}（${channelLabel}）` : caps.join("、");
}

export function buildLiveModelPricingRows(
  pricing?: CreationPricing | null,
  channelModels?: PublicImageChannelModel[] | null,
): ModelPricingRow[] {
  const defaultModel = (pricing?.image_default_model || "").trim() || "gpt-image-2.6-flare";
  const cost26Flare = positiveCost(pricing?.gpt_image_2_6_flare_credit_cost, 5);
  const cost26 = positiveCost(pricing?.gpt_image_2_6_credit_cost, 5);
  const cost26Sunburst = positiveCost(pricing?.gpt_image_2_6_sunburst_credit_cost, 5);
  const cost25Flare = positiveCost(
    pricing?.gpt_image_2_5_flare_credit_cost ?? pricing?.image_credit_cost_4k,
    3,
  );
  const cost25Sunburst = positiveCost(
    pricing?.gpt_image_2_5_sunburst_credit_cost ?? pricing?.image_credit_cost_4k,
    3,
  );
  const cost25 = positiveCost(
    pricing?.gpt_image_2_5_credit_cost ?? pricing?.image_credit_cost_2k,
    2,
  );
  const cost2 = positiveCost(
    pricing?.gpt_image_2_credit_cost ?? pricing?.image_credit_cost_1080p,
    1,
  );
  const grok1k = positiveCost(pricing?.grok_image_credit_cost_1k, 1);
  const grok2k = positiveCost(pricing?.grok_image_credit_cost_2k, 2);
  const videoPerSecond = positiveCost(pricing?.video_credit_cost_per_second, 1);

  const rows: ModelPricingRow[] = [
    {
      model: "gpt-image-2.6-flare",
      recommended: defaultModel === "gpt-image-2.6-flare",
      price: `${cost26Flare} 积分/张`,
      capabilities: "支持文生图、参考图改图、直出 GIF 动图",
    },
    {
      model: "gpt-image-2.6",
      recommended: defaultModel === "gpt-image-2.6",
      price: `${cost26} 积分/张`,
      capabilities: "支持文生图、改图、GIF 动图",
    },
    {
      model: "gpt-image-2.6-sunburst",
      recommended: defaultModel === "gpt-image-2.6-sunburst",
      price: `${cost26Sunburst} 积分/张`,
      capabilities: "支持文生图、改图、GIF 动图",
    },
  ];

  if (cost25Flare === cost25Sunburst) {
    rows.push({
      model: "gpt-image-2.5-flare / gpt-image-2.5-sunburst",
      recommended:
        defaultModel === "gpt-image-2.5-flare" || defaultModel === "gpt-image-2.5-sunburst",
      price: `${cost25Flare} 积分/张`,
      capabilities: "高清静态图 PNG / JPEG / WebP",
    });
  } else {
    rows.push(
      {
        model: "gpt-image-2.5-flare",
        recommended: defaultModel === "gpt-image-2.5-flare",
        price: `${cost25Flare} 积分/张`,
        capabilities: "高清静态图 PNG / JPEG / WebP",
      },
      {
        model: "gpt-image-2.5-sunburst",
        recommended: defaultModel === "gpt-image-2.5-sunburst",
        price: `${cost25Sunburst} 积分/张`,
        capabilities: "高清静态图 PNG / JPEG / WebP",
      },
    );
  }

  rows.push(
    {
      model: "gpt-image-2.5",
      recommended: defaultModel === "gpt-image-2.5",
      price: `${cost25} 积分/张`,
      capabilities: "标准静态图 PNG / JPEG / WebP",
    },
    {
      model: "gpt-image-2",
      recommended: defaultModel === "gpt-image-2",
      price: `${cost2} 积分/张`,
      capabilities: "轻量快速静态图 PNG / JPEG / WebP",
    },
    {
      model: "grok-imagine-image",
      recommended: defaultModel === "grok-imagine-image",
      price: `1K ${grok1k} 积分 / 2K ${grok2k} 积分`,
      capabilities: "Grok 生图与参考图改图",
    },
    {
      model: "grok-imagine-video",
      price: `${videoPerSecond} 积分/秒`,
      capabilities: "Grok 视频生成（支持首帧参考图）",
    },
  );

  if (Array.isArray(channelModels) && channelModels.length > 0) {
    const seenCustomModels = new Set<string>();
    for (const channelModel of channelModels) {
      const modelId = (channelModel.upstream_model || channelModel.display_name || "").trim();
      if (!modelId) {
        continue;
      }
      const normalizedId = modelId.toLowerCase();
      if (BUILTIN_PRICING_MODEL_IDS.has(normalizedId)) {
        if (channelModel.channel_type === "openai_compatible") {
          const customPrice = formatChannelModelPrice(channelModel);
          const match = rows.find((item) =>
            item.model
              .split("/")
              .map((part) => part.trim().toLowerCase())
              .includes(normalizedId),
          );
          if (match && match.model.toLowerCase() === normalizedId) {
            match.price = customPrice;
          }
        }
        continue;
      }
      if (seenCustomModels.has(normalizedId)) {
        continue;
      }
      seenCustomModels.add(normalizedId);
      rows.push({
        model: modelId,
        recommended: defaultModel === modelId,
        price: formatChannelModelPrice(channelModel),
        capabilities: formatChannelModelCapabilities(channelModel),
      });
    }
  }

  if (!rows.some((row) => row.recommended)) {
    rows[0].recommended = true;
  }

  return rows;
}

/**
 * Resolve the API base origin from `webConfig.apiUrl`, falling back to `window.location.origin`
 * when `webConfig.apiUrl` is empty or relative.
 */
export function resolveProfileApiBaseOrigin(
  configuredApiUrl?: string | null,
  windowOrigin?: string | null,
): string {
  const fallbackOrigin =
    (windowOrigin || "").trim().replace(/\/+$/, "") ||
    "https://your-domain.example.com";
  const raw = (configuredApiUrl || "").trim();
  if (!raw || (!/^https?:\/\//i.test(raw) && !raw.startsWith("//"))) {
    return fallbackOrigin;
  }
  try {
    const parsed = new URL(raw, fallbackOrigin);
    const cleanPath = parsed.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return fallbackOrigin;
  }
}
