export type AccountType = "Free" | "Plus" | "ProLite" | "Pro" | "Team";
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";

export type Account = {
  id: string;
  access_token?: string;
  token_preview?: string;
  type: AccountType;
  status: AccountStatus;
  quota: number;
  imageQuotaUnknown?: boolean;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restoreAt?: string | null;
  success: number;
  fail: number;
  lastUsedAt: string | null;
  proxy_configured?: boolean;
  proxy_timezone?: string;
};

export type AccountListResponse = {
  items: Account[];
};

export type AccountTokensResponse = {
  tokens: string[];
};

export type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  removed?: number;
  refreshed?: number;
  errors?: Array<{ access_token?: string; account_id?: string; error: string }>;
};

export type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token?: string; account_id?: string; error: string }>;
};

export type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};
