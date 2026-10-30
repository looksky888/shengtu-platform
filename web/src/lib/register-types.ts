/** Shown when a credential is stored but never returned by the API (blank keeps it). */
export const STORED_SECRET_HINT = "已保存，留空保持不变";

export type RegisterClearanceConfig = {
  enabled: boolean;
  mode: "none" | "manual" | "flaresolverr";
  flaresolverr_url: string;
  timeout_seconds: number;
  refresh_interval_seconds: number;
  proxy: string;
  user_agent: string;
  /** Never returned by the API: a stored pair is only reported as configured. */
  cf_clearance: string;
  cf_cookies: string;
  cf_credentials_configured?: boolean;
};

export type OutlookPoolStats = {
  unused?: number;
  in_use?: number;
  used?: number;
  token_invalid?: number;
  failed?: number;
};

/** One Checkout extraction attempt from python register_service. */
export type CheckoutTask = {
  task_id?: string;
  index?: number;
  email?: string;
  status?: string;
  stage?: string;
  progress_detail?: string;
  attempt?: number;
  next_retry_at?: string;
  channel?: "upi" | "pix" | string;
  payment_link?: string;
  error_short?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type RegisterConfig = {
  enabled: boolean;
  /** 3.5: openai | grok when backend=python */
  target?: "openai" | "grok" | string;
  backend?: string;
  error?: string;
  mail: {
    request_timeout: number;
    wait_timeout: number;
    wait_interval: number;
    providers: Array<Record<string, unknown>>;
  };
  proxy: string;
  clearance: RegisterClearanceConfig;
  total: number;
  threads: number;
  mode: "total" | "quota" | "available";
  target_quota: number;
  target_available: number;
  check_interval: number;
  /** Grok captcha / oauth block from python register_service */
  grok?: Record<string, unknown>;
  checkout?: Record<string, unknown>;
  sub2api_sync?: Record<string, unknown>;
  outlook_pool?: OutlookPoolStats;
  stats: {
    job_id?: string;
    success: number;
    fail: number;
    done: number;
    running: number;
    threads: number;
    elapsed_seconds?: number;
    avg_seconds?: number;
    success_rate?: number;
    current_quota?: number;
    current_available?: number;
    started_at?: string;
    updated_at?: string;
    finished_at?: string;
  };
  logs: Array<{
    time: string;
    text: string;
    level: string;
  }>;
  /** Checkout final-link extraction tasks (OpenAI register). */
  checkout_tasks?: CheckoutTask[];
  checkout_logs?: Array<{ time: string; text: string; level?: string }>;
  checkout_retries_active?: boolean;
  checkout_retry_job_count?: number;
};
