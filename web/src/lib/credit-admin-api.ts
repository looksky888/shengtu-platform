import type { CreditAccount, CreditCard, CreditLedgerEntry, GeneratedCreditCard, ProfileCheckinResponse, ProfileCreditLedgerResponse, ProfileCredits, ProfileInviteInfo, ProfileRedeemResponse } from "@/lib/api-types";
import { httpRequest } from "@/lib/request";

function creditCardPath(cardId: string) { return `/api/admin/credits/cards/${encodeURIComponent(cardId)}`; }
export async function fetchProfileCredits() { return httpRequest<ProfileCredits>("/api/profile/credits"); }
export async function fetchProfileCreditLedger(query: { page?: number; page_size?: number } = {}) {
  const params = new URLSearchParams();
  if (query.page && query.page > 0) params.set("page", String(query.page));
  if (query.page_size && query.page_size > 0) params.set("page_size", String(query.page_size));
  const qs = params.toString();
  return httpRequest<ProfileCreditLedgerResponse>(qs ? `/api/profile/credits/ledger?${qs}` : "/api/profile/credits/ledger");
}
export async function performProfileCheckin() { return httpRequest<ProfileCheckinResponse>("/api/profile/checkin", { method: "POST", body: {} }); }
export async function fetchProfileInvite() { return httpRequest<ProfileInviteInfo>("/api/profile/invite"); }
export async function redeemProfileCredits(key: string) { return httpRequest<ProfileRedeemResponse>("/api/profile/credits/redeem", { method: "POST", body: { key } }); }
export async function generateCreditCards(amount: number, count?: number) { return httpRequest<{ items: GeneratedCreditCard[] }>("/api/admin/credits/cards/generate", { method: "POST", body: typeof count === "number" ? { amount, count } : { amount } }); }

export type CreditCardsQuery = { page: number; page_size: number; keyword?: string; status?: string; start_at?: string; end_at?: string };
export type CreditCardsPage = { items: CreditCard[]; total: number; page: number; page_size: number; active_count: number; used_count: number };
export type CreditLedgerQuery = { page: number; page_size: number; keyword?: string; reason?: string; start_at?: string; end_at?: string };
export type CreditLedgerPage = { items: CreditLedgerEntry[]; total: number; page: number; page_size: number };
export type CreditUsersQuery = { page: number; page_size: number; keyword?: string; start_at?: string; end_at?: string };
export type CreditUsersPage = { items: CreditAccount[]; total: number; page: number; page_size: number; total_balance: number; account_count: number };

function queryParams(query: CreditCardsQuery | CreditLedgerQuery | CreditUsersQuery) {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) });
  for (const key of ["keyword", "status", "reason", "start_at", "end_at"] as const) {
    const value = (query as Partial<Record<typeof key, string>>)[key];
    if (value?.trim()) params.set(key, value.trim());
  }
  return params;
}
export async function fetchCreditCards(query: CreditCardsQuery, options: { signal?: AbortSignal } = {}) { return httpRequest<CreditCardsPage>(`/api/admin/credits/cards?${queryParams(query)}`, { signal: options.signal }); }
export async function disableCreditCard(cardId: string) { return httpRequest<{ item: CreditCard }>(`${creditCardPath(cardId)}/disable`, { method: "POST", body: {} }); }
export async function fetchCreditLedger(query: CreditLedgerQuery, options: { signal?: AbortSignal } = {}) { return httpRequest<CreditLedgerPage>(`/api/admin/credits/ledger?${queryParams(query)}`, { signal: options.signal }); }
export async function fetchCreditUsers(query: CreditUsersQuery, options: { signal?: AbortSignal } = {}) { return httpRequest<CreditUsersPage>(`/api/admin/credits/users?${queryParams(query)}`, { signal: options.signal }); }
export async function fetchAllCreditUsers(options: { signal?: AbortSignal } = {}) {
  const items: CreditAccount[] = [];
  let page = 1, totalBalance = 0, accountCount = 0;
  for (;;) {
    const data = await fetchCreditUsers({ page, page_size: 100 }, options);
    items.push(...(Array.isArray(data.items) ? data.items : []));
    totalBalance = typeof data.total_balance === "number" ? data.total_balance : totalBalance;
    accountCount = typeof data.account_count === "number" ? data.account_count : accountCount;
    if (items.length >= (data.total ?? 0) || !data.items?.length || page >= 1000) break;
    page += 1;
  }
  return { items, total_balance: totalBalance, account_count: accountCount };
}
export async function adjustUserCredits(userId: string, delta: number, reason?: string) { return httpRequest<{ account: CreditAccount; entry: CreditLedgerEntry }>(`/api/admin/credits/users/${encodeURIComponent(userId)}/adjust`, { method: "POST", body: reason ? { delta, reason } : { delta } }); }
