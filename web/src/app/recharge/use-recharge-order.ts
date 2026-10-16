import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import webConfig from "@/constants/common-env";
import { cancelPaymentOnLeave } from "@/lib/payment-order-leave";
import { cancelPaymentOrder, queryPaymentOrder, type PaymentOrder } from "@/lib/user-payment-api";

export function useRechargeOrder(sessionKey: string) {
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState("");
  const [querying, setQuerying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const current = useRef<PaymentOrder | null>(null);
  const mounted = useRef(false);
  const revision = useRef(0);
  const queryRequest = useRef<Promise<void> | null>(null);
  const cancelPending = useRef(false);
  const leaveSent = useRef(false);
  const notified = useRef("");

  const cancelOnLeave = useCallback((item: PaymentOrder | null) => {
    if (!item || !["created", "pending"].includes(item.status) || leaveSent.current || cancelPending.current) return;
    leaveSent.current = true;
    void cancelPaymentOnLeave(webConfig.apiUrl, sessionKey, item.id).catch((reason: unknown) => {
      leaveSent.current = false;
      toast.error(reason instanceof Error ? reason.message : "离开页面时关单未确认");
    });
  }, [sessionKey]);

  const replaceOrder = useCallback((item: PaymentOrder | null) => {
    revision.current += 1;
    current.current = item;
    leaveSent.current = false;
    if (!mounted.current) {
      cancelOnLeave(item);
      return;
    }
    setOrder(item);
    setError("");
  }, [cancelOnLeave]);

  const refresh = useCallback((): Promise<void> => {
    if (!mounted.current || cancelPending.current || !current.current) return Promise.resolve();
    if (queryRequest.current) return queryRequest.current;
    const item = current.current;
    const version = revision.current;
    const stillCurrent = () => mounted.current && revision.current === version;
    setQuerying(true);
    const request = queryPaymentOrder(item.id).then((result) => {
      if (!stillCurrent()) return;
      current.current = result.item;
      setOrder(result.item);
      setError("");
    }).catch((reason: unknown) => {
      if (stillCurrent()) setError(reason instanceof Error ? reason.message : "订单状态查询失败");
    }).finally(() => {
      if (queryRequest.current === request) queryRequest.current = null;
      if (mounted.current) setQuerying(false);
    });
    queryRequest.current = request;
    return request;
  }, []);

  const cancel = useCallback(async () => {
    const item = current.current;
    if (!item || cancelPending.current || !["created", "pending"].includes(item.status)) return;
    cancelPending.current = true;
    const version = ++revision.current;
    setCancelling(true);
    try {
      const result = await cancelPaymentOrder(item.id);
      if (!mounted.current || revision.current !== version) return;
      current.current = result.item;
      setOrder(result.item);
      setError("");
      if (result.item.status === "closed" || result.item.status === "failed") {
        toast.success("支付订单已结束，可以重新选择套餐");
      } else if (result.item.status === "closing") {
        toast.info("关单结果确认中，请稍候");
      }
    } catch (reason: unknown) {
      if (mounted.current && revision.current === version) {
        const message = reason instanceof Error ? reason.message : "取消支付失败";
        setError(message);
        toast.error(message);
      }
    } finally {
      cancelPending.current = false;
      if (mounted.current) {
        setCancelling(false);
        // Let a superseded query finish before loading the authoritative state.
        await queryRequest.current;
        if (revision.current === version) await refresh();
      }
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    const onLeave = () => {
      revision.current += 1;
      cancelOnLeave(current.current);
    };
    const onShow = () => { leaveSent.current = false; void refresh(); };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("pageshow", onShow);
    return () => {
      mounted.current = false;
      onLeave();
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("pageshow", onShow);
    };
  }, [cancelOnLeave, refresh]);

  const pollingID = order?.id;
  const pollingStatus = order?.status;
  useEffect(() => {
    if (!pollingID || !pollingStatus || !["created", "pending", "closing"].includes(pollingStatus)) return;
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    return () => window.clearInterval(timer);
  }, [pollingID, pollingStatus, refresh]);

  useEffect(() => {
    if (order?.status !== "succeeded" || notified.current === order.id) return;
    notified.current = order.id;
    toast.success(order.product_type === "cloud_storage" ? "云存储权益已到账" : "积分已到账");
  }, [order]);

  return { order, error, querying, cancelling, replaceOrder, refresh, cancel };
}
