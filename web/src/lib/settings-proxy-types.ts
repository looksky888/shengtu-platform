export type ImageProxyHealthEvent = {
  at: string;
  success: boolean;
  model?: string;
  path?: string;
  duration_ms?: number;
  status_code?: number;
  code?: string;
  message?: string;
};

export type ImageProxyModelHealth = {
  model: string;
  total: number;
  success: number;
  failed: number;
  success_rate: number;
  rate_limited: number;
  timeout: number;
  gateway_errors: number;
  average_latency_ms: number;
  last_status: "success" | "failed" | "unknown" | string;
  last_error?: string;
  last_error_code?: string;
  last_error_at?: string;
  last_success_at?: string;
};

export type ImageProxyHealthCore = {
  total: number;
  success: number;
  failed: number;
  success_rate: number;
  rate_limited: number;
  timeout: number;
  gateway_errors: number;
  http_502?: number;
  http_524?: number;
  average_latency_ms: number;
  last_status: "success" | "failed" | "unknown" | string;
  last_error?: string;
  last_error_code?: string;
  last_error_at?: string;
  last_success_at?: string;
  recent: ImageProxyHealthEvent[];
  models?: ImageProxyModelHealth[];
};

export type ImageProxyHealth = ImageProxyHealthCore & {
  provider?: string;
  model?: string;
  base_url_configured?: boolean;
  api_key_configured?: boolean;
  channels?: {
    proxy_api?: ImageProxyHealthCore;
    account_pool?: ImageProxyHealthCore;
    [key: string]: ImageProxyHealthCore | undefined;
  };
};
