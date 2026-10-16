"use client";

import { Activity, LoaderCircle, Network, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchImageProxyHealth } from "@/lib/settings-api";
import type { ImageProxyHealth, ImageProxyHealthCore } from "@/lib/settings-types";

import { ImageProxyChannelHealthCard } from "./image-proxy-channel-health-card";
import { createEmptyImageProxyHealth } from "./image-proxy-health-utils";
import { SettingsNotice } from "./settings-ui";

type ChannelKey = "proxy_api";

export function ImageProxyHealthPanel() {
  const [health, setHealth] = useState<ImageProxyHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchImageProxyHealth();
      setHealth(data.health);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载中转站健康状态失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const channels: Partial<Record<ChannelKey, ImageProxyHealthCore>> = health?.channels || {};
  const gptHealth = channels.proxy_api || createEmptyImageProxyHealth();
  const hasChannelSplit = Boolean(health?.channels);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-[#1456f0]" />
          <div>
            <div className="text-sm font-semibold text-foreground">GPT 中转站健康状态</div>
            <div className="text-xs text-muted-foreground">
              仅统计 GPT 中转（proxy_api）。Grok 走号池 + grok-runtime，不在此面板。
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => void loadHealth()} disabled={loading}>
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          刷新
        </Button>
      </div>

      {error ? <SettingsNotice className="border-rose-100 bg-rose-50 text-rose-700">{error}</SettingsNotice> : null}
      {health ? <ProxyHealthStatusBanner health={health} gpt={gptHealth} /> : null}

      {hasChannelSplit ? (
        <ImageProxyChannelHealthCard
          title="GPT 中转站"
          description="仅统计 GPT 中转请求"
          icon={Network}
          health={gptHealth}
          configuredHint={
            health?.base_url_configured
              ? `已配置 · 模型 ${health.model || "-"}`
              : "未配置 GPT 中转 URL（号池模式可忽略）"
          }
        />
      ) : (
        <ImageProxyChannelHealthCard
          title="中转站（汇总）"
          description="当前通道整体状态"
          icon={Activity}
          health={health || createEmptyImageProxyHealth()}
        />
      )}
    </div>
  );
}

/** Separates "not configured" from "has traffic but failing". */
function ProxyHealthStatusBanner({ health, gpt }: { health: ImageProxyHealth; gpt: ImageProxyHealthCore }) {
  const gptConfigured = Boolean(health.base_url_configured);
  const gptFailing = gptConfigured && gpt.total > 0 && (gpt.last_status === "failed" || gpt.success_rate < 60);

  if (!gptConfigured) {
    return (
      <SettingsNotice className="border-amber-100 bg-amber-50 text-amber-900">
        未配置 GPT 中转 URL。若使用号池生图可忽略；Grok 生图始终走号池，无需中转配置。
      </SettingsNotice>
    );
  }
  if (gptFailing) {
    return (
      <SettingsNotice className="border-rose-100 bg-rose-50 text-rose-800">
        GPT 中转近期成功率 {gpt.success_rate}%（样本 {gpt.total}）。请检查中转站额度、模型名与上游网关状态。
      </SettingsNotice>
    );
  }
  if (gptConfigured && gpt.total === 0) {
    return <SettingsNotice>配置已就绪，暂无对应渠道生图样本。产生请求后将在此显示成功率与错误码。</SettingsNotice>;
  }
  return null;
}
