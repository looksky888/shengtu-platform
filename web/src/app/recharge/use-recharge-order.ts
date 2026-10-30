import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  loadActiveRechargeOrder,
  syncActiveRechargeOrderStorage,
} from "@/app/recharge/recharge-order-storage";
import { cancelPaymentOrder, queryPaymentOrder, type PaymentOrder } from "@/lib/user-payment-api";
import { dispatchQuotaRefresh } from "@/lib/quota-events";

export function useRechargeOrder(sessionKey: string) {
  const [order, setOrder] = useState<PaymentOrder | null>(() => loadActiveRechargeOrder(sessionKey));
  const [error, setError] = useState("");
  const [querying, setQuerying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const current = useRef<PaymentOrder | null>(order);
  const mounted = useRef(false);
  const revision = useRef(0);
  const queryRequest = useRef<Promise<void> | null>(null);
  const cancelPending = useRef(false);
  const notified = useRef("");

  const applyOrder = useCallback(
    (item: PaymentOrder | null) => {
      current.current = item;
      syncActiveRechargeOrderStorage(sessionKey, item);
      if (mounted.current) {
        setOrder(item);
      }
    },
    [sessionKey],
  );

  const replaceOrder = useCallback(
    (item: PaymentOrder | null) => {
      revision.current += 1;
      applyOrder(item);
      if (mounted.current) {
        setError("");
      }
    },
    [applyOrder],
  );

  const refresh = useCallback((options?: { manual?: boolean }): Promise<void> => {
    if (!mounted.current || cancelPending.current || !current.current) return Promise.resolve();
    if (queryRequest.current) return queryRequest.current;
    const item = current.current;
    const version = revision.current;
    const stillCurrent = () => mounted.current && revision.current === version;
    setQuerying(true);
    const request = queryPaymentOrder(item.id)
      .then((result) => {
        if (!stillCurrent()) return;
        applyOrder(result.item);
        setError("");
        if (options?.manual && result.item.status !== "succeeded") {
          if (result.item.status === "created" || result.item.status === "pending") {
            toast.info("尚未检测到付款到账，扫码支付后页面会自动更新");
          } else {
            toast.info("订单状态已同步更新");
          }
        }
      })
      .catch((reason: unknown) => {
        if (stillCurrent()) {
          const message = reason instanceof Error ? reason.message : "订单状态查询失败";
          setError(message);
          if (options?.manual) {
            toast.error(message);
          }
        }
      })
      .finally(() => {
        if (queryRequest.current === request) queryRequest.current = null;
        if (mounted.current) setQuerying(false);
      });
    queryRequest.current = request;
    return request;
  }, [applyOrder]);

  const cancel = useCallback(async () => {
    const item = current.current;
    if (!item || cancelPending.current || !["created", "pending"].includes(item.status)) return;
    cancelPending.current = true;
    const version = ++revision.current;
    setCancelling(true);
    try {
      const result = await cancelPaymentOrder(item.id);
      if (!mounted.current || revision.current !== version) return;
      applyOrder(result.item);
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
        await queryRequest.current;
        if (revision.current === version && current.current && ["created", "pending", "closing"].includes(current.current.status)) {
          await refresh();
        }
      }
    }
  }, [applyOrder, refresh]);

  useEffect(() => {
    const restored = loadActiveRechargeOrder(sessionKey);
    if (restored && (!current.current || current.current.id !== restored.id)) {
      current.current = restored;
      setOrder(restored);
      setError("");
    }
  }, [sessionKey]);

  useEffect(() => {
    mounted.current = true;
    if (current.current && ["created", "pending", "closing"].includes(current.current.status)) {
      void refresh();
    }
    const onShow = () => {
      if (document.visibilityState === "hidden") return;
      if (current.current && ["created", "pending", "closing"].includes(current.current.status)) {
        void refresh();
      }
    };
    window.addEventListener("pageshow", onShow);
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      mounted.current = false;
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [refresh]);

  const pollingID = order?.id;
  const pollingStatus = order?.status;
  useEffect(() => {
    if (!pollingID || !pollingStatus || !["created", "pending", "closing"].includes(pollingStatus)) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        void refresh();
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [pollingID, pollingStatus, refresh]);

  useEffect(() => {
    if (order?.status !== "succeeded" || notified.current === order.id) return;
    notified.current = order.id;
    toast.success(order.product_type === "cloud_storage" ? "云存储权益已到账" : "积分已到账");
    dispatchQuotaRefresh();
  }, [order]);

  return { order, error, querying, cancelling, replaceOrder, refresh, cancel };
}
