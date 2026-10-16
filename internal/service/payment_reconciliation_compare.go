package service

import (
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"github.com/google/uuid"
)

func compareTradeBill(rows []tradeBillRow, billOrders, daySucceededOrders []storage.PaymentOrderRecord, runID string) (storage.PaymentReconciliationRunRecord, []storage.PaymentReconciliationItemRecord) {
	local := make(map[string]storage.PaymentOrderRecord, len(billOrders))
	for _, order := range billOrders {
		local[order.OutTradeNo] = order
	}
	seen := make(map[string]struct{}, len(rows))
	result := storage.PaymentReconciliationRunRecord{BillRows: len(rows)}
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
	for _, order := range daySucceededOrders {
		if _, ok := seen[order.OutTradeNo]; !ok {
			result.MissingBillOrders++
			items = append(items, storage.PaymentReconciliationItemRecord{ID: uuid.NewString(), RunID: runID, Category: "missing_bill", OutTradeNo: order.OutTradeNo, LocalOrderID: order.ID, LocalAmountFen: order.AmountFen, Detail: "本地成功订单未出现在账单", CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)})
		}
	}
	return result, items
}

func reconciliationItem(runID, category, outTradeNo string, row tradeBillRow, order storage.PaymentOrderRecord, detail string) storage.PaymentReconciliationItemRecord {
	return storage.PaymentReconciliationItemRecord{ID: uuid.NewString(), RunID: runID, Category: category, OutTradeNo: outTradeNo, TransactionID: row.TransactionID, LocalOrderID: order.ID, BillAmountFen: row.AmountFen, LocalAmountFen: order.AmountFen, Detail: detail, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
}
