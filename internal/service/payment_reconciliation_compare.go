package service

import (
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"github.com/google/uuid"
)

// Reconciliation difference categories. refund_not_reversed and
// refund_bill_unavailable are detection-only: the reconciliation never changes
// order state or credits, because reversing funds requires an explicit human
// decision.
const (
	reconciliationCategoryRefundNotReversed     = "refund_not_reversed"
	reconciliationCategoryRefundBillUnavailable = "refund_bill_unavailable"
)

func compareTradeBill(rows, refundRows []tradeBillRow, billOrders, daySucceededOrders []storage.PaymentOrderRecord, runID string) (storage.PaymentReconciliationRunRecord, []storage.PaymentReconciliationItemRecord) {
	local := make(map[string]storage.PaymentOrderRecord, len(billOrders))
	for _, order := range billOrders {
		local[order.OutTradeNo] = order
	}
	seen := make(map[string]struct{}, len(rows))
	result := storage.PaymentReconciliationRunRecord{BillRows: len(rows) + len(refundRows)}
	items := make([]storage.PaymentReconciliationItemRecord, 0)
	for _, row := range rows {
		if !strings.HasPrefix(row.OutTradeNo, "ST") {
			result.SkippedExternal++
			continue
		}
		order, ok := local[row.OutTradeNo]
		if !ok {
			result.MissingLocalOrders++
			items = append(items, reconciliationItem(runID, "missing_local", row.OutTradeNo, row, storage.PaymentOrderRecord{}, "账单存在、本地无订单"))
			continue
		}
		seen[row.OutTradeNo] = struct{}{}
		matched := true
		if row.AmountFen != order.AmountFen {
			matched = false
			result.AmountMismatches++
			items = append(items, reconciliationItem(runID, "amount_mismatch", row.OutTradeNo, row, order, "账单金额与本地订单不一致"))
		}
		if row.Currency != "" && row.Currency != order.Currency {
			matched = false
			result.StatusMismatches++
			items = append(items, reconciliationItem(runID, "currency_mismatch", row.OutTradeNo, row, order, "账单币种与本地订单不一致"))
		}
		if order.Status != storage.PaymentOrderStatusSucceeded || !strings.EqualFold(row.Status, "SUCCESS") || (row.TransactionID != "" && row.TransactionID != order.TransactionID) {
			matched = false
			result.StatusMismatches++
			items = append(items, reconciliationItem(runID, "status_mismatch", row.OutTradeNo, row, order, "账单状态或微信订单号与本地订单不一致"))
		}
		if matched {
			result.MatchedOrders++
		}
	}
	compareRefundBillRows(refundRows, local, seen, runID, &result, &items)
	for _, order := range daySucceededOrders {
		if _, ok := seen[order.OutTradeNo]; !ok {
			result.MissingBillOrders++
			items = append(items, storage.PaymentReconciliationItemRecord{ID: uuid.NewString(), RunID: runID, Category: "missing_bill", OutTradeNo: order.OutTradeNo, LocalOrderID: order.ID, LocalAmountFen: order.AmountFen, Detail: "本地成功订单未出现在账单", CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)})
		}
	}
	return result, items
}

// compareRefundBillRows turns the REFUND bill into reconciliation differences.
// A completed provider refund whose local order is still succeeded means the
// user kept the credits (and, for storage products, the entitlement) after the
// money went back: that is reported, never auto-reversed. Orders present in the
// refund bill are recorded in seen, so a refunded order is not additionally
// reported as missing from the payment bill.
func compareRefundBillRows(refundRows []tradeBillRow, local map[string]storage.PaymentOrderRecord, seen map[string]struct{}, runID string, result *storage.PaymentReconciliationRunRecord, items *[]storage.PaymentReconciliationItemRecord) {
	for _, row := range refundRows {
		if !strings.HasPrefix(row.OutTradeNo, "ST") || !tradeBillRefundSucceeded(row) {
			continue
		}
		seen[row.OutTradeNo] = struct{}{}
		order, ok := local[row.OutTradeNo]
		if !ok {
			result.MissingLocalOrders++
			*items = append(*items, reconciliationItem(runID, "missing_local", row.OutTradeNo, row, storage.PaymentOrderRecord{}, "退款账单存在、本地无订单"))
			continue
		}
		if order.Status != storage.PaymentOrderStatusSucceeded {
			continue
		}
		result.StatusMismatches++
		*items = append(*items, reconciliationItem(runID, reconciliationCategoryRefundNotReversed, row.OutTradeNo, row, order, "上游退款已成功，本地订单仍为已支付；积分与权益未扣回，需人工确认后再处理"))
	}
}

// reconciliationRefundBillUnavailableItem records that the refund-side bill
// could not be read, so the run's refund coverage is incomplete.
func reconciliationRefundBillUnavailableItem(runID string, err error) storage.PaymentReconciliationItemRecord {
	detail := strings.TrimSpace(err.Error())
	if len(detail) > 200 {
		detail = detail[:200]
	}
	return storage.PaymentReconciliationItemRecord{ID: uuid.NewString(), RunID: runID, Category: reconciliationCategoryRefundBillUnavailable, Detail: "退款账单不可用，本次对账未覆盖退款差异: " + detail, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
}

func reconciliationItem(runID, category, outTradeNo string, row tradeBillRow, order storage.PaymentOrderRecord, detail string) storage.PaymentReconciliationItemRecord {
	return storage.PaymentReconciliationItemRecord{ID: uuid.NewString(), RunID: runID, Category: category, OutTradeNo: outTradeNo, TransactionID: row.TransactionID, LocalOrderID: order.ID, BillAmountFen: row.AmountFen, LocalAmountFen: order.AmountFen, Detail: detail, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
}
