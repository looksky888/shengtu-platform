import { assertItemsResponse } from "@/lib/api-contract";
import { httpRequest } from "@/lib/request";

export type RechargeProduct = { id: string; sku: string; name: string; description?: string; amount_fen: number; credits: number; product_type?: string; storage_days?: number; storage_bytes?: number };
export type PaymentSettings = { recharge_enabled: boolean; custom_credits_enabled: boolean; cloud_storage_enabled: boolean; credit_unit_price_fen: number; min_custom_credits: number; max_custom_credits: number };
export type PaymentOrder = { id: string; out_trade_no: string; product_id: string; product_name: string; amount_fen: number; credits: number; product_type?: string; storage_days?: number; storage_bytes?: number; currency: string; expires_at: string; status: string; code_url?: string; created_at: string; updated_at: string; channel_id?: string };
export type PaymentChannel = { id: string; name: string; provider: string; payment_method: string; is_default: boolean };
export type StorageEntitlement = { user_id: string; storage_bytes: number; used_bytes: number; expires_at?: string };

export async function fetchRechargeProducts() {
  const result = await httpRequest<{ items: RechargeProduct[] }>("/api/payment/products");
  assertItemsResponse<RechargeProduct>(result, "充值商品");
  return result;
}
export async function fetchPaymentChannels() {
  const result = await httpRequest<{ items: PaymentChannel[] }>("/api/payment/channels");
  assertItemsResponse<PaymentChannel>(result, "支付渠道");
  return result;
}
export async function fetchPaymentSettings() { return httpRequest<{ item: PaymentSettings }>("/api/payment/settings"); }
export async function fetchStorageEntitlement() { return httpRequest<{ item: StorageEntitlement }>("/api/payment/storage-entitlement"); }
export async function createPaymentOrder(productId: string, idempotencyKey: string, channelId?: string) { return httpRequest<{ item: PaymentOrder }>("/api/payment/orders", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: { product_id: productId, ...(channelId ? { channel_id: channelId } : {}) } }); }
export async function createCustomCreditsOrder(credits: number, idempotencyKey: string, channelId?: string) { return httpRequest<{ item: PaymentOrder }>("/api/payment/orders", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: { custom_credits: credits, ...(channelId ? { channel_id: channelId } : {}) } }); }
export async function queryPaymentOrder(orderId: string) { return httpRequest<{ item: PaymentOrder }>(`/api/payment/orders/${encodeURIComponent(orderId)}`); }
export async function cancelPaymentOrder(orderId: string) { return httpRequest<{ item: PaymentOrder }>(`/api/payment/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST", body: {} }); }
export async function fetchRecentPaymentOrders(limit = 10) {
  const result = await httpRequest<{ items: PaymentOrder[] }>(`/api/payment/orders?limit=${Math.max(1, Math.min(30, limit))}`);
  assertItemsResponse<PaymentOrder>(result, "充值记录");
  return result;
}
