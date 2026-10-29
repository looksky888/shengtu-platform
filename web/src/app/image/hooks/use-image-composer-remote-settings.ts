import { useEffect, useState } from "react";

import { DEFAULT_IMAGE_CREDIT_COSTS, type ImageCreditCosts } from "@/app/image/lib/image-page-types";
import { fetchCreationPricing } from "@/lib/settings-api";

export function useImageComposerRemoteSettings() {
  const [imageCreditCosts, setImageCreditCosts] = useState<ImageCreditCosts>(DEFAULT_IMAGE_CREDIT_COSTS);
  const [imageProvider, setImageProvider] = useState<"account_pool" | "proxy_api">("account_pool");

  useEffect(() => {
    let cancelled = false;
    fetchCreationPricing()
      .then((config) => {
        if (cancelled) return;
        const cost1080p = Math.max(1, Number(config.image_credit_cost_1080p) || DEFAULT_IMAGE_CREDIT_COSTS["1080p"]);
        const cost2k = Math.max(1, Number(config.image_credit_cost_2k) || DEFAULT_IMAGE_CREDIT_COSTS["2k"]);
        const cost4k = Math.max(1, Number(config.image_credit_cost_4k) || DEFAULT_IMAGE_CREDIT_COSTS["4k"]);
        setImageCreditCosts({
          "1080p": cost1080p,
          "2k": cost2k,
          "4k": cost4k,
          gptImage2: Math.max(1, Number(config.gpt_image_2_credit_cost) || cost1080p),
          gptImage25: Math.max(1, Number(config.gpt_image_2_5_credit_cost) || cost2k),
          gptImage25Flare: Math.max(1, Number(config.gpt_image_2_5_flare_credit_cost) || cost4k),
          gptImage25Sunburst: Math.max(1, Number(config.gpt_image_2_5_sunburst_credit_cost) || cost4k),
          grok1k: Math.max(1, Number(config.grok_image_credit_cost_1k) || DEFAULT_IMAGE_CREDIT_COSTS.grok1k),
          grok2k: Math.max(1, Number(config.grok_image_credit_cost_2k) || DEFAULT_IMAGE_CREDIT_COSTS.grok2k),
        });
        setImageProvider(config.image_provider === "proxy_api" ? "proxy_api" : "account_pool");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return { imageCreditCosts, imageProvider };
}
