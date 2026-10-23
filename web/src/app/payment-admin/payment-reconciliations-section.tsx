import { useEffect, useMemo, useState } from "react";
import { format, parse, subDays } from "date-fns";
import {
  CalendarIcon,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Scale,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PaymentReconciliationDetailDialog } from "@/app/payment-admin/payment-reconciliation-detail-dialog";
import { PaymentSectionState } from "@/app/payment-admin/payment-section-state";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchAdminPaymentReconciliation,
  fetchAdminPaymentReconciliations,
  triggerAdminPaymentReconciliation,
  type PaymentChannel,
  type PaymentReconciliationDetail,
  type PaymentReconciliationRun,
} from "@/lib/payment-admin-api";

function getYesterdayString(): string {
  return format(subDays(new Date(), 1), "yyyy-MM-dd");
}

function getRunDiffCount(run: PaymentReconciliationRun): number {
  return (
    run.missing_local_orders +
    run.missing_bill_orders +
    run.amount_mismatches +
    run.status_mismatches
  );
}

export function PaymentReconciliationsSection({
  channels,
}: {
  channels: PaymentChannel[];
}) {
  const maxBillDate = getYesterdayString();
  const [channelId, setChannelId] = useState("");
  const [billDate, setBillDate] = useState(maxBillDate);
  const [billDateOpen, setBillDateOpen] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [items, setItems] = useState<PaymentReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [selected, setSelected] = useState<PaymentReconciliationDetail | null>(
    null,
  );

  const channel = channels.find((item) => item.id === channelId);
  const supported = channel?.provider === "wechatpay";

  const selectedBillDateObj = useMemo(
    () => (billDate ? parse(billDate, "yyyy-MM-dd", new Date()) : undefined),
    [billDate],
  );

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetchAdminPaymentReconciliations({
        page: 1,
        page_size: 50,
      });
      setItems(response.items);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "加载对账记录失败";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!channelId && channels.length) {
      const preferred =
        channels.find((entry) => entry.provider === "wechatpay") ?? channels[0];
      setChannelId(preferred.id);
    }
  }, [channelId, channels]);

  const trigger = async () => {
    if (!supported || triggering || !billDate) return;
    setTriggering(true);
    try {
      await triggerAdminPaymentReconciliation(channelId, billDate);
      toast.success("对账任务已提交");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setTriggering(false);
    }
  };

  const openDetail = async (runId: string) => {
    if (openingId) return;
    setOpeningId(runId);
    try {
      const detail = await fetchAdminPaymentReconciliation(runId, {
        page: 1,
        page_size: 100,
      });
      setSelected(detail);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "加载明细失败");
    } finally {
      setOpeningId("");
    }
  };

  const hasFilters = Boolean(
    filterStartDate || filterEndDate || statusFilter !== "all",
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (filterStartDate && item.bill_date < filterStartDate) {
        return false;
      }
      const effectiveEnd = filterEndDate || filterStartDate;
      if (effectiveEnd && item.bill_date > effectiveEnd) {
        return false;
      }
      return true;
    });
  }, [items, statusFilter, filterStartDate, filterEndDate]);

  const clearFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setStatusFilter("all");
  };

  return (
    <>
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/70 bg-surface-muted/35 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Scale className="size-4.5 text-muted-foreground" />
                账单对账
                {!loading ? (
                  <Badge variant="secondary" className="rounded-md tabular-nums">
                    共 {items.length} 条记录
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                按账单日期拉取上游支付渠道交易流水，与本地订单逐笔核对漏单、金额与状态差异。
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={loading}
              onClick={() => void load()}
            >
              {!loading ? <RefreshCw className="size-3.5" /> : null}
              刷新
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 pt-4 sm:p-5 sm:pt-5">
          <div className="rounded-xl border border-border/75 bg-surface-subtle/50 p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">发起手动对账</span>
              <span>仅支持对 T-1 及更早的历史结算日发起对账</span>
            </div>
            <div className="grid gap-2.5 md:grid-cols-[1fr_200px_auto]">
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger className="h-9 rounded-lg bg-surface">
                  <SelectValue placeholder="选择支付渠道" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ·{" "}
                      {item.provider === "alipay" ? "支付宝" : "微信支付"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover open={billDateOpen} onOpenChange={setBillDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="选择账单日期"
                    className="h-9 w-full justify-start rounded-lg bg-surface px-3 font-normal tabular-nums"
                  >
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{billDate || "选择账单日期"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="elevated-shadow w-auto border-border bg-popover p-2.5 dark:bg-card"
                  align="start"
                  collisionPadding={12}
                  sideOffset={8}
                >
                  <Calendar
                    mode="single"
                    defaultMonth={selectedBillDateObj}
                    selected={selectedBillDateObj}
                    disabled={(date) =>
                      format(date, "yyyy-MM-dd") > maxBillDate
                    }
                    onSelect={(date) => {
                      if (!date) return;
                      setBillDate(format(date, "yyyy-MM-dd"));
                      setBillDateOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                className="h-9 rounded-lg px-4"
                loading={triggering}
                disabled={!supported || triggering || !billDate}
                onClick={() => void trigger()}
              >
                {!triggering ? <Scale className="size-4" /> : null}
                {triggering ? "提交中…" : "手动对账"}
              </Button>
            </div>
          </div>

          {channel && !supported ? (
            <div className="rounded-xl border border-status-warning/30 bg-status-warning-soft p-3 text-sm text-status-warning">
              当前为支付宝渠道，账单下载对账入口已关闭；支付和主动查单不受影响。
            </div>
          ) : null}

          {!loading && !loadError && items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter
                startDate={filterStartDate}
                endDate={filterEndDate}
                onChange={(start, end) => {
                  setFilterStartDate(start);
                  setFilterEndDate(end);
                }}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  aria-label="对账状态筛选"
                  className="h-9 w-full rounded-lg sm:w-36"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="succeeded">已完成</SelectItem>
                  <SelectItem value="running">处理中</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-lg"
                  onClick={clearFilters}
                >
                  <X className="size-4" />
                  清除筛选
                </Button>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <PaymentSectionState mode="loading" title="正在加载对账记录" />
          ) : loadError ? (
            <PaymentSectionState
              mode="error"
              title="对账记录加载失败"
              detail={loadError}
              onRetry={() => void load()}
            />
          ) : items.length === 0 ? (
            <PaymentSectionState
              mode="empty"
              icon={Scale}
              title="暂无对账记录"
              detail="可选择微信支付渠道与账单日期，点击「手动对账」拉取账单核对。"
            />
          ) : filteredItems.length === 0 ? (
            <PaymentSectionState
              mode="empty"
              icon={Scale}
              title="没有符合筛选条件的对账记录"
              detail="请调整日期范围或对账状态筛选条件。"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                >
                  <X className="size-4" />
                  清空筛选条件
                </Button>
              }
            />
          ) : (
            <div className="grid gap-2">
              {filteredItems.map((item) => {
                const diffCount = getRunDiffCount(item);
                const isOpening = openingId === item.id;
                const channelName =
                  channels.find((entry) => entry.id === item.channel_id)?.name ||
                  item.channel_id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    disabled={isOpening}
                    onClick={() => void openDetail(item.id)}
                    className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/75 bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-surface-hover/60 disabled:opacity-70"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {item.bill_date}
                      </span>
                      <span className="truncate font-medium text-foreground/90">
                        {channelName}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        账单 {item.bill_rows} 笔 · 匹配 {item.matched_orders} 笔
                      </span>
                      {item.last_error ? (
                        <span className="max-w-xs truncate text-xs text-status-danger">
                          {item.last_error}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {diffCount > 0 ? (
                        <Badge variant="warning" className="tabular-nums">
                          差异 {diffCount} 笔
                        </Badge>
                      ) : item.status === "succeeded" ? (
                        <span className="text-xs text-muted-foreground">
                          账实一致
                        </span>
                      ) : null}
                      <Badge
                        variant={
                          item.status === "succeeded"
                            ? "success"
                            : item.status === "failed"
                              ? "danger"
                              : "secondary"
                        }
                      >
                        {item.status === "succeeded"
                          ? "已完成"
                          : item.status === "failed"
                            ? "失败"
                            : "处理中"}
                      </Badge>
                      {isOpening ? (
                        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PaymentReconciliationDetailDialog
        detail={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
