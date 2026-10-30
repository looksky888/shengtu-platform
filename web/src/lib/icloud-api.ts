import { httpRequest } from "@/lib/request";
import {
  buildICloudMailboxListQuery,
  type ICloudMailboxListParams,
} from "@/lib/icloud-mailbox-list-query";

export type { ICloudMailboxUsage } from "@/lib/icloud-mailbox-list-query";

const path = (suffix: string) => `/api/icloud/${suffix.replace(/^\//, "")}`;

/** Never treat sidecar errors as main-app session expiry. */
const icloudOpts = { redirectOnUnauthorized: false as const };
type ICloudRequestOptions = { signal?: AbortSignal };

export type ICloudBridgeStatus = {
  enabled?: boolean;
  reachable?: boolean;
  base_url?: string;
  status_code?: number;
  error?: string;
};

/** Canonical login channel state from sidecar (v3.6+). */
export type LoginChannelState = "absent" | "saved" | "ok" | "error" | "expired";

export type ICloudSession = {
  account_id?: string;
  apple_id?: string;
  account_label?: string;
  apple_account_login_saved?: boolean;
  icloud_web_login_saved?: boolean;
  icloud_imap_login_saved?: boolean;
  apple_account_login_checked?: boolean;
  icloud_web_login_checked?: boolean;
  icloud_imap_login_checked?: boolean;
  apple_account_login_ok?: boolean;
  icloud_web_login_ok?: boolean;
  icloud_imap_login_ok?: boolean;
  /** Preferred: absent | saved | ok | error | expired */
  apple_account_login_state?: LoginChannelState | string;
  icloud_web_login_state?: LoginChannelState | string;
  icloud_imap_login_state?: LoginChannelState | string;
  apple_account_login_status?: string;
  icloud_web_login_status?: string;
  icloud_imap_login_status?: string;
  [key: string]: unknown;
};

/** Derive channel state from legacy booleans when state field is missing. */
export function resolveLoginChannelState(
  state: string | undefined,
  saved?: boolean,
  checked?: boolean,
  ok?: boolean,
): LoginChannelState {
  if (state === "absent" || state === "saved" || state === "ok" || state === "error" || state === "expired") {
    return state;
  }
  if (!saved) return "absent";
  if (!checked) return "saved";
  if (ok === false) return "error";
  return "ok";
}

export type ICloudMailbox = {
  id?: string;
  email?: string;
  label?: string;
  note?: string;
  status?: string;
  tag?: string;
  tag_color?: ICloudMailboxTagColor;
  account_id?: string;
  account_apple_id?: string;
  account_label?: string;
  api_url?: string;
  api_active?: boolean;
  openai_claimed?: boolean;
  grok_claimed?: boolean;
  [key: string]: unknown;
};

export type ICloudMailboxTagColor = "slate" | "blue" | "green" | "amber" | "red" | "violet";

export type ICloudMessage = {
  id?: string;
  subject?: string;
  from?: string;
  body?: string;
  received_at?: string;
  [key: string]: unknown;
};

export type ICloudPendingLogin = {
  success?: boolean;
  needs_2fa?: boolean;
  pending_id?: string;
  apple_id?: string;
  message?: string;
  sessions?: ICloudSession[];
  session?: ICloudSession | null;
  [key: string]: unknown;
};

export type ICloudCodeResponse = {
  success?: boolean;
  code?: string;
  subject?: string;
  received_at?: string;
  message?: string;
  sync_error?: string;
  error?: string;
};

export type ICloudScheduler = {
  running?: boolean;
  status?: string;
  success?: number;
  failed?: number;
  next_run_at?: string;
  last_error?: string;
  apple_account_quota?: number;
  icloud_web_quota?: number;
  target_per_account?: number;
  events?: Array<{ id?: number; at?: string; type?: string; message?: string; email?: string }>;
  [key: string]: unknown;
};

export type ICloudStatus = {
  success?: boolean;
  icloud_sessions?: ICloudSession[];
  mailboxes?: number;
  [key: string]: unknown;
};

export type ICloudMailboxList = {
  mailboxes?: ICloudMailbox[];
  summary?: { total?: number; openai_claimed?: number };
  pagination?: { page?: number; page_size?: number; total?: number; total_all?: number; total_pages?: number };
};

export type ICloudMailboxLookup = {
  success: true;
  mailboxes: ICloudMailbox[];
  missing: string[];
};

export const icloudApi = {
  bridgeStatus: (options: ICloudRequestOptions = {}) =>
    httpRequest<ICloudBridgeStatus>(path("bridge-status"), { ...icloudOpts, ...options }),
  status: (options: ICloudRequestOptions = {}) =>
    httpRequest<ICloudStatus>(path("status"), { ...icloudOpts, ...options }),
  checkSession: (payload: { account_id?: string } = {}) =>
    httpRequest<{ message?: string; sessions?: ICloudSession[] }>(path("icloud/session/check"), {
      ...icloudOpts,
      method: "POST",
      body: payload,
    }),
  startLogin: (channel: "apple" | "icloud", payload: { apple_id: string; password: string; two_factor_method?: string }) =>
    httpRequest<ICloudPendingLogin>(
      path(channel === "apple" ? "apple-account/login/start" : "icloud/protocol-login/start"),
      { ...icloudOpts, method: "POST", body: payload },
    ),
  submit2fa: (channel: "apple" | "icloud", payload: { pending_id: string; code: string; phone_number?: string }) =>
    httpRequest<ICloudPendingLogin>(
      path(channel === "apple" ? "apple-account/login/2fa" : "icloud/protocol-login/2fa"),
      { ...icloudOpts, method: "POST", body: payload },
    ),
  saveImapLogin: (payload: { account_id?: string; email: string; app_password: string }) =>
    httpRequest<{ message?: string; sessions?: ICloudSession[] }>(path("icloud/imap-login/save"), {
      ...icloudOpts,
      method: "POST",
      body: payload,
    }),
  checkImapLogin: (payload: { account_id?: string } = {}) =>
    httpRequest<{ message?: string; sessions?: ICloudSession[] }>(path("icloud/imap-login/check"), {
      ...icloudOpts,
      method: "POST",
      body: payload,
    }),
  createMailboxes: (payload: { account_ids?: string[]; label?: string; note?: string; create_channel?: string }) =>
    httpRequest<{ message?: string; mailboxes?: ICloudMailbox[]; results?: unknown[] }>(path("icloud/mailboxes/create"), {
      ...icloudOpts,
      method: "POST",
      body: payload,
    }),
  syncMailboxes: (payload: { account_id?: string } = {}) =>
    httpRequest<{ message?: string; mailboxes?: ICloudMailbox[]; results?: Array<{ account_id?: string; apple_id?: string; error?: string }> }>(
      path("icloud/mailboxes/sync"),
      { ...icloudOpts, method: "POST", body: payload },
    ),
  listMailboxes: (
    params: ICloudMailboxListParams = {},
    options: ICloudRequestOptions = {},
  ) => {
    const qs = buildICloudMailboxListQuery(params);
    return httpRequest<ICloudMailboxList>(path(qs ? `mailboxes?${qs}` : "mailboxes"), {
      ...icloudOpts,
      ...options,
    });
  },
  lookupMailboxes: async (emails: string[]) => {
    const result = await httpRequest<ICloudMailboxLookup>(path("mailboxes/lookup"), {
      ...icloudOpts,
      method: "POST",
      body: { emails },
    });
    if (result.success !== true || !Array.isArray(result.mailboxes) || !Array.isArray(result.missing)) {
      throw new Error("iCloud 邮箱匹配返回格式错误");
    }
    return result;
  },
  syncMailbox: (id: string, keyword = "auto") => {
    const q = new URLSearchParams({ keyword });
    return httpRequest<{ success?: boolean; synced?: number }>(path(`mailboxes/${encodeURIComponent(id)}/sync?${q.toString()}`), {
      ...icloudOpts,
      method: "POST",
      body: {},
    });
  },
  setMailboxTag: (id: string, payload: { tag: string; tag_color: ICloudMailboxTagColor | "" }) =>
    httpRequest<{ success?: boolean; mailbox?: ICloudMailbox }>(path(`mailboxes/${encodeURIComponent(id)}/tag`), {
      ...icloudOpts,
      method: "POST",
      body: payload,
    }),
  /** Remove a privacy mailbox from local inventory (and synced messages). */
  deleteMailbox: (id: string) =>
    httpRequest<{ success?: boolean }>(path(`mailboxes/${encodeURIComponent(id)}`), {
      ...icloudOpts,
      method: "DELETE",
    }),
  listMessages: (id: string) =>
    httpRequest<{ messages?: ICloudMessage[] }>(path(`mailboxes/${encodeURIComponent(id)}/messages`), icloudOpts),
  fetchCode: (id: string, keyword = "auto") => {
    const q = new URLSearchParams({ keyword, peek: "1", wait_ms: "12000" });
    return httpRequest<ICloudCodeResponse>(path(`mailboxes/${encodeURIComponent(id)}/code?${q.toString()}`), icloudOpts);
  },
  schedulerStatus: (options: ICloudRequestOptions = {}) =>
    httpRequest<{ scheduler?: ICloudScheduler }>(path("icloud/scheduler/status"), { ...icloudOpts, ...options }),
  startScheduler: (payload: {
    account_ids?: string[];
    label?: string;
    note?: string;
    create_channel?: string;
    interval_seconds?: number;
    interval_minutes?: number;
  }) =>
    httpRequest<{ message?: string; scheduler?: ICloudScheduler }>(path("icloud/scheduler/start"), {
      ...icloudOpts,
      method: "POST",
      body: payload,
    }),
  stopScheduler: () =>
    httpRequest<{ message?: string; scheduler?: ICloudScheduler }>(path("icloud/scheduler/stop"), {
      ...icloudOpts,
      method: "POST",
      body: {},
    }),
  clearSchedulerLogs: () =>
    httpRequest<{ message?: string; scheduler?: ICloudScheduler }>(path("icloud/scheduler/logs/clear"), {
      ...icloudOpts,
      method: "POST",
      body: {},
    }),
};
