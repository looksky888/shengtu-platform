export type AuthRole = "admin" | "user";
export type AnnouncementTarget = "login" | "image";

export type PermissionMenu = {
  id: string;
  label: string;
  path: string;
  icon?: string;
  order?: number;
  children?: PermissionMenu[];
};

export type ApiPermission = {
  key: string;
  method: string;
  path: string;
  label: string;
  group: string;
  subtree?: boolean;
};

export type LoginResponse = {
  ok: boolean;
  version: string;
  token?: string;
  role: AuthRole;
  role_id?: string;
  role_name?: string;
  subject_id: string;
  name: string;
  provider?: string;
  credential_id?: string;
  credential_name?: string;
  menu_paths?: string[];
  api_permissions?: string[];
  menus?: PermissionMenu[];
};

export type AuthProviders = {
  registration: {
    enabled: boolean;
    email: {
      enabled: boolean;
      required: boolean;
      code_length: number;
      expires_in_seconds: number;
      resend_after_seconds: number;
    };
    risk: {
      enabled: boolean;
      device_success_limit: number;
      device_window_days: number;
      ip_success_limit: number;
      ip_distinct_device_limit: number;
      ip_window_hours: number;
      pair_attempt_limit: number;
      pair_attempt_window_minutes: number;
      subnet_success_limit: number;
      subnet_window_hours: number;
    };
  };
  password_reset: {
    enabled: boolean;
    code_length: number;
    expires_in_seconds: number;
    resend_after_seconds: number;
  };
  terms: {
    version: string;
    title: string;
  };
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  image_url?: string;
  enabled?: boolean;
  show_login: boolean;
  show_image: boolean;
  popup_version?: number;
  last_broadcast_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UserKey = {
  id: string;
  name: string;
  role: AuthRole;
  role_id?: string;
  role_name?: string;
  kind?: "api_key";
  provider?: "local" | string;
  owner_id?: string;
  owner_name?: string;
  key_hint?: string;
  enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
  menu_paths?: string[];
  api_permissions?: string[];
};

export type ProfileApiKeyRateLimits = {
  rpm_limit: number;
  concurrent_limit: number;
  daily_limit: number;
  unlimited: boolean;
};

export type ManagedUser = {
  id: string;
  username?: string;
  email?: string;
  name: string;
  role: "user";
  role_id?: string;
  role_name?: string;
  provider: "local" | string;
  owner_id?: string;
  owner_name?: string;
  enabled: boolean;
  has_api_key: boolean;
  has_session: boolean;
  api_key_id?: string;
  api_key_name?: string;
  session_id?: string;
  session_name?: string;
  credential_count: number;
  created_at: string | null;
  last_used_at: string | null;
  updated_at?: string | null;
  menu_paths?: string[];
  api_permissions?: string[];
  /** Present on paginated admin list responses. */
  credit_balance?: number;
  /** Days since last activity; large when never active. */
  inactive_days?: number;
};

/** On-demand usage row from GET /api/admin/users/usage (not embedded on ManagedUser). */
export type ManagedUserUsage = {
  call_count: number;
  success_count: number;
  failure_count: number;
  quota_used: number;
  usage_curve: Array<{
    date: string;
    calls: number;
    success: number;
    failure: number;
    quota_used: number;
  }>;
};

export type ManagedRole = {
  id: string;
  name: string;
  description?: string;
  builtin?: boolean;
  user_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
  menu_paths?: string[];
  api_permissions?: string[];
};

export type CreateManagedUserPayload = {
  username: string;
  name?: string;
  password: string;
  role_id?: string;
  enabled?: boolean;
};

export type CreditAccount = {
  user_id: string;
  balance: number;
  created_at: string | null;
  updated_at: string | null;
};

export type CreditLedgerReason =
  | "signup"
  | "checkin"
  | "invite"
  | "card_redeem"
  | "admin_manual_adjust"
  | "image_generation"
  | "image_edit"
  | "image_refund"
  | "video_generation"
  | "video_refund";

export type CreditLedgerEntry = {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: CreditLedgerReason | string;
  ref_id?: string | null;
  created_at: string | null;
};

export type CreditCardStatus = "active" | "used" | "disabled";

export type CreditCard = {
  id: string;
  key?: string | null;
  amount: number;
  status: CreditCardStatus;
  used_by?: string | null;
  used_at: string | null;
  created_at: string | null;
};

export type GeneratedCreditCard = CreditCard & {
  key: string;
};

export type ProfileCredits = {
  account: CreditAccount;
  balance: number;
  checked_in_today: boolean;
};

export type ProfileCheckinResponse = {
  account: CreditAccount;
  balance: number;
  entry: CreditLedgerEntry;
  awarded: boolean;
};

export type ProfileInviteInfo = {
  code: string;
  link: string;
};

export type ProfileCreditLedgerResponse = {
  items: CreditLedgerEntry[];
  total?: number;
  page?: number;
  page_size?: number;
};

export type ProfileRedeemResponse = {
  account: CreditAccount;
  balance: number;
  entry: CreditLedgerEntry;
  card: CreditCard;
};
