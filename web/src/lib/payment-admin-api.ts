import { httpRequest } from "@/lib/request";
import { assertItemsResponse, assertOffsetPage } from "@/lib/api-contract";

export type PaymentChannel = { id: string; code: string; name: string; provider: string; payment_method: string; enabled: boolean; is_default: boolean; active_version_id: string; notify_base_url: string; order_expire_minutes: number; created_at: string; updated_at: string };
export type PaymentChannelInput = Pick<PaymentChannel, "code" | "name" | "provider" | "payment_method" | "enabled" | "is_default" | "notify_base_url" | "order_expire_minutes">;
export type PaymentCredentialsInput = { app_id: string; merchant_id: string; merchant_cert_serial: string; merchant_private_key_pem: string; api_v3_key: string; verify_mode: string; wechatpay_public_key_id: string; wechatpay_public_key_pem: string; alipay_private_key_pem: string; alipay_public_key_pem: string; alipay_gateway: string; alipay_seller_id: string };
export type AdminRechargeProduct = { id: string; sku: string; name: string; description: string; amount_fen: number; credits: number; enabled: boolean; sort_order: number; product_type: "credits" | "cloud_storage"; storage_days: number; storage_bytes: number; created_at: string; updated_at: string };
export type RechargeProductInput = Omit<AdminRechargeProduct, "id" | "created_at" | "updated_at">;
export type AdminPaymentOrder = { id: string; out_trade_no: string; user_id: string; channel_id: string; channel_version_id?: string; product_id?: string; product_name: string; amount_fen: number; credits: number; currency: string; expires_at: string; status: string; provider_trade_state?: string; provider_trade_desc?: string; transaction_id?: string; provider_request_id?: string; last_query_at?: string; query_attempts: number; paid_at?: string; credited_at?: string; closed_at?: string; last_error_code?: string; last_error_message?: string; created_at: string; updated_at?: string };
export type PaymentOrderPage = { items: AdminPaymentOrder[]; total: number; page: number; page_size: number };
export type PaymentReconciliationRun = { id: string; channel_id: string; channel_version_id: string; bill_date: string; status: string; bill_rows: number; matched_orders: number; missing_local_orders: number; missing_bill_orders: number; amount_mismatches: number; status_mismatches: number; skipped_external: number; last_error?: string; started_at?: string; finished_at?: string; created_at: string; updated_at: string };
export type PaymentReconciliationPage = { items: PaymentReconciliationRun[]; total: number; page: number; page_size: number };
export type PaymentReconciliationItem = { id: string; run_id: string; category: string; out_trade_no: string; transaction_id?: string; local_order_id?: string; bill_amount_fen: number; local_amount_fen: number; detail: string; created_at: string };
export type PaymentReconciliationDetail = { run: PaymentReconciliationRun; items: PaymentReconciliationItem[]; total: number; page: number; page_size: number };
export type PaymentSettings = { recharge_enabled: boolean; custom_credits_enabled: boolean; cloud_storage_enabled: boolean; credit_unit_price_fen: number; min_custom_credits: number; max_custom_credits: number; updated_at?: string };
export type PaymentStatsPeriod = { total_orders: number; succeeded_orders: number; failed_orders: number; closed_orders: number; succeeded_amount_fen: number; credited_credits: number; success_rate: number };
export type PaymentStatsChannel = { channel_id: string; total_orders: number; succeeded_orders: number; succeeded_amount_fen: number; success_rate: number };
export type PaymentStatsDay = { date: string; total_orders: number; succeeded_orders: number; succeeded_amount_fen: number };
export type PaymentStats = { today: PaymentStatsPeriod; last_7_days: PaymentStatsPeriod; current_month: PaymentStatsPeriod; all_time: PaymentStatsPeriod; channel_breakdown: PaymentStatsChannel[]; daily_trend: PaymentStatsDay[] };

export const emptyPaymentChannelInput = (): PaymentChannelInput => ({ code: "", name: "微信支付", provider: "wechatpay", payment_method: "native", enabled: false, is_default: true, notify_base_url: "", order_expire_minutes: 15 });
export const emptyPaymentCredentialsInput = (): PaymentCredentialsInput => ({ app_id: "", merchant_id: "", merchant_cert_serial: "", merchant_private_key_pem: "", api_v3_key: "", verify_mode: "platform_public_key", wechatpay_public_key_id: "", wechatpay_public_key_pem: "", alipay_private_key_pem: "", alipay_public_key_pem: "", alipay_gateway: "https://openapi.alipay.com/gateway.do", alipay_seller_id: "" });
export const emptyRechargeProductInput = (): RechargeProductInput => ({ sku: "", name: "", description: "", amount_fen: 100, credits: 10, enabled: true, sort_order: 0, product_type: "credits", storage_days: 30, storage_bytes: 10737418240 });

export async function fetchPaymentChannels() {
  const result = await httpRequest<{ items: PaymentChannel[] }>("/api/admin/payment-channels");
  assertItemsResponse<PaymentChannel>(result, "支付渠道");
  return result;
}
export const createPaymentChannel = (channel: PaymentChannelInput, credentials: PaymentCredentialsInput) => httpRequest<{ item: PaymentChannel }>("/api/admin/payment-channels", { method: "POST", body: { channel, credentials } });
export const updatePaymentChannel = (id: string, channel: PaymentChannelInput) => httpRequest<{ item: PaymentChannel }>(`/api/admin/payment-channels/${encodeURIComponent(id)}`, { method: "PATCH", body: channel });
export const rotatePaymentCredentials = (id: string, credentials: PaymentCredentialsInput) => httpRequest(`/api/admin/payment-channels/${encodeURIComponent(id)}/versions`, { method: "POST", body: credentials });
export async function fetchAdminRechargeProducts() {
  const result = await httpRequest<{ items: AdminRechargeProduct[] }>("/api/admin/recharge-products");
  assertItemsResponse<AdminRechargeProduct>(result, "充值商品");
  return result;
}
export const fetchPaymentSettings = () => httpRequest<{ item: PaymentSettings }>("/api/admin/payment-settings");
export const updatePaymentSettings = (settings: PaymentSettings) => httpRequest<{ item: PaymentSettings }>("/api/admin/payment-settings", { method: "PUT", body: settings });
export const fetchPaymentStats = () => httpRequest<PaymentStats>("/api/admin/payment-stats");
export const createAdminRechargeProduct = (product: RechargeProductInput) => httpRequest<{ item: AdminRechargeProduct }>("/api/admin/recharge-products", { method: "POST", body: product });
export const updateAdminRechargeProduct = (id: string, product: RechargeProductInput) => httpRequest<{ item: AdminRechargeProduct }>(`/api/admin/recharge-products/${encodeURIComponent(id)}`, { method: "PATCH", body: product });
export const deleteAdminRechargeProduct = (id: string) => httpRequest<{ deleted: boolean }>(`/api/admin/recharge-products/${encodeURIComponent(id)}`, { method: "DELETE" });
export async function fetchAdminPaymentOrders(query: { page: number; page_size: number; keyword?: string; status?: string }) {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.status) params.set("status", query.status);
  const result = await httpRequest<PaymentOrderPage>(`/api/admin/payment-orders?${params}`);
  assertOffsetPage<AdminPaymentOrder>(result, "支付订单");
  return result;
}
export const queryAdminPaymentOrder = (id: string) => httpRequest<{ item: AdminPaymentOrder }>(`/api/admin/payment-orders/${encodeURIComponent(id)}/query`, { method: "POST", body: {} });
export async function fetchAdminPaymentReconciliations(query: { page: number; page_size: number; channel_id?: string; status?: string; bill_date?: string }) {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) });
  if (query.channel_id) params.set("channel_id", query.channel_id);
  if (query.status) params.set("status", query.status);
  if (query.bill_date) params.set("bill_date", query.bill_date);
  const result = await httpRequest<PaymentReconciliationPage>(`/api/admin/payment-reconciliations?${params}`);
  assertOffsetPage<PaymentReconciliationRun>(result, "支付对账记录");
  return result;
}
export const triggerAdminPaymentReconciliation = (channel_id: string, bill_date: string) => httpRequest<{ item: PaymentReconciliationRun }>("/api/admin/payment-reconciliations", { method: "POST", body: { channel_id, bill_date } });
export const fetchAdminPaymentReconciliation = (id: string, query: { page: number; page_size: number; category?: string }) => { const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) }); if (query.category) params.set("category", query.category); return httpRequest<PaymentReconciliationDetail>(`/api/admin/payment-reconciliations/${encodeURIComponent(id)}?${params}`); };
