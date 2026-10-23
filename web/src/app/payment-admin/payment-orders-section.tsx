import { useCallback, useEffect, useRef, useState } from "react";
import { ReceiptText, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PaymentOrderDetailsDialog } from "@/app/payment-admin/payment-order-details-dialog";
import { PaymentOrdersFilters, PaymentOrdersPagination } from "@/app/payment-admin/payment-orders-controls";
import { PaymentOrdersTable } from "@/app/payment-admin/payment-orders-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentSectionState } from "@/app/payment-admin/payment-section-state";
import {
  fetchAdminPaymentOrders,
  fetchPaymentChannels,
  queryAdminPaymentOrder,
  type AdminPaymentOrder,
  type PaymentChannel,
} from "@/lib/payment-admin-api";

export function PaymentOrdersSection() {
  const [items, setItems] = useState<AdminPaymentOrder[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [queryingID, setQueryingID] = useState("");
  const [selected, setSelected] = useState<AdminPaymentOrder | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const requestSeqRef = useRef(0);
  const pageSize = 20;

  useEffect(() => {
    let active = true;
    fetchPaymentChannels()
      .then((res) => {
        if (active) setChannels(res.items);
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "支付渠道暂时不可用，已使用渠道编号展示",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setLoadError("");
    try {
      const orders = await fetchAdminPaymentOrders({
        page,
        page_size: pageSize,
        keyword: keyword || undefined,
        status: status === "all" ? undefined : status,
      });
      if (seq !== requestSeqRef.current) return;
      setItems(orders.items);
      setTotal(orders.total);
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      const message = error instanceof Error ? error.message : "加载支付订单失败";
      setLoadError(message);
      toast.error(message);
      setItems([]);
      setTotal(0);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [keyword, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const query = async (item: AdminPaymentOrder) => {
    if (queryingID) return;
    setQueryingID(item.id);
    try {
      const result = await queryAdminPaymentOrder(item.id);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? result.item : entry)),
      );
      setSelected(result.item);
      toast.success("查单完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "查单失败");
    } finally {
      setQueryingID("");
    }
  };

  const applySearch = () => {
    setPage(1);
    setKeyword(keywordInput.trim());
  };
  const clearFilters = () => {
    setPage(1);
    setKeywordInput("");
    setKeyword("");
    setStatus("all");
  };
  const hasFilters = Boolean(keyword.trim() || keywordInput.trim() || status !== "all");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="border-b border-border/70 bg-surface-muted/35">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4.5 text-muted-foreground" />
              充值订单流水
              {!loading ? (
                <Badge variant="secondary" className="rounded-md tabular-nums">
                  共 {total} 笔
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              查看用户发起的在线支付订单，支持按状态筛选或主动向第三方渠道发起查单同步。
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-4 sm:p-5 sm:pt-5">
        <PaymentOrdersFilters
          keyword={keywordInput}
          status={status}
          hasFilters={hasFilters}
          onKeywordChange={setKeywordInput}
          onStatusChange={(value) => { setPage(1); setStatus(value); }}
          onApply={applySearch}
          onClear={clearFilters}
        />
        {loadError ? (
          <PaymentSectionState mode="error" title="订单流水加载失败" detail={loadError} onRetry={() => void load()} />
        ) : (
          <PaymentOrdersTable
            items={items}
            channels={channels}
            loading={loading}
            hasFilters={hasFilters}
            queryingID={queryingID}
            onOpen={setSelected}
            onQuery={(item) => void query(item)}
            onClearFilters={clearFilters}
          />
        )}
        {!loading && !loadError && total > 0 ? (
          <PaymentOrdersPagination page={page} pages={pages} total={total} pageSize={pageSize} loading={loading} onPageChange={setPage} />
        ) : null}
      </CardContent>
      <PaymentOrderDetailsDialog
        item={selected}
        channels={channels}
        querying={Boolean(selected && queryingID === selected.id)}
        onClose={() => setSelected(null)}
        onQuery={() => {
          if (selected) void query(selected);
        }}
      />
    </Card>
  );
}
