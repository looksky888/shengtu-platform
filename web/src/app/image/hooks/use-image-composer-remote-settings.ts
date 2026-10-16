import { useEffect, useState } from "react";

import { DEFAULT_IMAGE_CREDIT_COSTS, type ImageCreditCosts } from "@/app/image/lib/image-page-types";
import { fetchSettingsConfig } from "@/lib/api";
import { fetchCreationPricing } from "@/lib/settings-api";

export function useImageComposerRemoteSettings() {
  const [imageCreditCosts, setImageCreditCosts] = useState<ImageCreditCosts>(DEFAULT_IMAGE_CREDIT_COSTS);
  const [imageProvider, setImageProvider] = useState<"account_pool" | "proxy_api">("account_pool");

  useEffect(() => {
    let cancelled = false;
    fetchCreationPricing()
      .then((config) => {
        if (cancelled) return;
        setImageCreditCosts({
          "1080p": Math.max(1, Number(config.image_credit_cost_1080p) || DEFAULT_IMAGE_CREDIT_COSTS["1080p"]),
          "2k": Math.max(1, Number(config.image_credit_cost_2k) || DEFAULT_IMAGE_CREDIT_COSTS["2k"]),
          "4k": Math.max(1, Number(config.image_credit_cost_4k) || DEFAULT_IMAGE_CREDIT_COSTS["4k"]),
          grok1k: Math.max(1, Number(config.grok_image_credit_cost_1k) || DEFAULT_IMAGE_CREDIT_COSTS.grok1k),
          grok2k: Math.max(1, Number(config.grok_image_credit_cost_2k) || DEFAULT_IMAGE_CREDIT_COSTS.grok2k),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSettingsConfig()
      .then((data) => {
        if (!cancelled) setImageProvider(data.config?.image_provider === "proxy_api" ? "proxy_api" : "account_pool");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return { imageCreditCosts, imageProvider };
}
