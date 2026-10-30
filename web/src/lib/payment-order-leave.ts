export function shouldWarnBeforeLeavingPendingOrder(
  order: { status?: string } | null | undefined,
): boolean {
  return Boolean(order && (order.status === "created" || order.status === "pending"));
}

// Unload requests cannot await the async session store; use the verified page session.
export async function cancelPaymentOnLeave(apiUrl: string, token: string, orderID: string) {
  const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/payment/orders/${encodeURIComponent(orderID)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: "{}",
    credentials: "include",
    keepalive: true,
  });
  // Payment may win the race with leaving. A conflict is not a cancelled order.
  if (!response.ok && response.status !== 409) {
    throw new Error("离开页面时关单未确认，请返回充值中心查询；未支付订单仍会按原期限过期。");
  }
}
