import { httpRequest } from "@/lib/request";
import { assertOffsetPage } from "@/lib/api-contract";
import type { Account, AccountListResponse, AccountMutationResponse, AccountRefreshResponse, AccountStatus, AccountTokensResponse, AccountType, AccountUpdateResponse } from "@/lib/api-types";

export type AccountsQuery = {
  page?: number;
  page_size?: number;
  keyword?: string;
  type?: string;
  status?: string;
};

export type AccountsPage = AccountListResponse & {
  total: number;
  page: number;
  page_size: number;
};

export async function fetchAccounts(query: AccountsQuery = {}, options: { signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  if (query.page && query.page > 0) params.set("page", String(query.page));
  if (query.page_size && query.page_size > 0) params.set("page_size", String(query.page_size));
  if (query.keyword?.trim()) params.set("keyword", query.keyword.trim());
  if (query.type?.trim() && query.type !== "all") params.set("type", query.type.trim());
  if (query.status?.trim() && query.status !== "all") params.set("status", query.status.trim());
  const qs = params.toString();
  const result = await httpRequest<AccountsPage>(qs ? `/api/accounts?${qs}` : "/api/accounts", {
    signal: options.signal,
  });
  assertOffsetPage<Account>(result, "账号列表");
  return result;
}

export async function fetchAccountTokens() {
  return httpRequest<AccountTokensResponse>("/api/accounts/tokens");
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function deleteAccounts(accountIds: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { account_ids: accountIds },
  });
}

export async function refreshAccounts(accountIds: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function updateAccount(
  accountId: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      account_id: accountId,
      ...updates,
    },
  });
}
