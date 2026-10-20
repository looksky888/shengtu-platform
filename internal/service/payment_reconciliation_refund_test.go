package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
)

func TestParseTradeBillRefundFileCapturesRefundColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "refund.csv")
	contents := "\ufeff申请退款时间,微信订单号,商户订单号,交易状态,货币种类,订单金额,微信退款单号,商户退款单号,退款金额,退款状态\n" +
		"2026-08-31,wx-1,ST123,SUCCESS,CNY,9.76,wxr-1,ST123R,9.76,SUCCESS\n" +
		"2026-08-31,wx-2,ST124,SUCCESS,CNY,5.00,wxr-2,ST124R,5.00,CLOSED\n" +
		"总退款单数,2,,,,,,,,\n"
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	rows, err := parseTradeBillFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %#v", rows)
	}
	if rows[0].RefundStatus != "SUCCESS" || rows[0].RefundAmountFen != 976 || rows[0].AmountFen != 976 {
		t.Fatalf("first row = %#v", rows[0])
	}
	if !tradeBillRefundSucceeded(rows[0]) {
		t.Fatal("successful refund row not recognised")
	}
	if tradeBillRefundSucceeded(rows[1]) {
		t.Fatal("CLOSED refund row treated as a completed refund")
	}
}

func TestTradeBillRefundSucceededNeedsTheRefundColumn(t *testing.T) {
	if tradeBillRefundSucceeded(tradeBillRow{OutTradeNo: "ST1", Status: "SUCCESS"}) {
		t.Fatal("missing 退款状态 column must not be read as a completed refund")
	}
}

func TestCompareTradeBillReportsRefundNotReversed(t *testing.T) {
	order := storage.PaymentOrderRecord{ID: "order-1", OutTradeNo: "ST1", Status: storage.PaymentOrderStatusSucceeded, Currency: "CNY", AmountFen: 100}
	refundRows := []tradeBillRow{{OutTradeNo: "ST1", Status: "SUCCESS", Currency: "CNY", AmountFen: 100, RefundStatus: "SUCCESS", RefundAmountFen: 100}}
	result, items := compareTradeBill(nil, refundRows, []storage.PaymentOrderRecord{order}, []storage.PaymentOrderRecord{order}, "run-1")
	if result.StatusMismatches != 1 || len(items) != 1 {
		t.Fatalf("result = %#v items = %#v", result, items)
	}
	if items[0].Category != reconciliationCategoryRefundNotReversed || items[0].OutTradeNo != "ST1" || items[0].LocalOrderID != "order-1" {
		t.Fatalf("refund item = %#v", items[0])
	}
	// Detection only: the comparison must not rewrite the local order or credits.
	if result.MatchedOrders != 0 || result.AmountMismatches != 0 {
		t.Fatalf("refund rows must not be counted as matched payments: %#v", result)
	}
	// A refunded order is not also "missing from the bill": it was found in the
	// refund-side bill, so only the refund difference is reported.
	if result.MissingBillOrders != 0 {
		t.Fatalf("refunded order double-reported as missing_bill: %#v", result)
	}
}

func TestCompareTradeBillIgnoresUnfinishedAndRefundedLocalOrders(t *testing.T) {
	succeeded := storage.PaymentOrderRecord{ID: "order-1", OutTradeNo: "ST1", Status: storage.PaymentOrderStatusSucceeded}
	for _, tc := range []struct {
		name string
		row  tradeBillRow
	}{
		{name: "refund not completed", row: tradeBillRow{OutTradeNo: "ST1", RefundStatus: "CLOSED"}},
		{name: "refund column missing", row: tradeBillRow{OutTradeNo: "ST1"}},
		{name: "refund processing", row: tradeBillRow{OutTradeNo: "ST1", RefundStatus: "PROCESSING"}},
		{name: "external order", row: tradeBillRow{OutTradeNo: "EXTERNAL", RefundStatus: "SUCCESS"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, items := compareTradeBill(nil, []tradeBillRow{tc.row}, []storage.PaymentOrderRecord{succeeded}, nil, "run-1")
			if result.StatusMismatches != 0 || len(items) != 0 {
				t.Fatalf("result = %#v items = %#v", result, items)
			}
		})
	}
	refundedLocally := storage.PaymentOrderRecord{ID: "order-2", OutTradeNo: "ST2", Status: storage.PaymentOrderStatusClosed}
	result, items := compareTradeBill(nil, []tradeBillRow{{OutTradeNo: "ST2", RefundStatus: "SUCCESS"}}, []storage.PaymentOrderRecord{refundedLocally}, nil, "run-1")
	if result.StatusMismatches != 0 || len(items) != 0 {
		t.Fatalf("already-reversed order reported again: result = %#v items = %#v", result, items)
	}
}

func TestCompareTradeBillReportsRefundForUnknownLocalOrder(t *testing.T) {
	refundRows := []tradeBillRow{{OutTradeNo: "ST9", RefundStatus: "SUCCESS", RefundAmountFen: 100}}
	result, items := compareTradeBill(nil, refundRows, nil, nil, "run-1")
	if result.MissingLocalOrders != 1 || len(items) != 1 || items[0].Category != "missing_local" {
		t.Fatalf("result = %#v items = %#v", result, items)
	}
}

func TestCompareTradeBillCountsRefundBillRows(t *testing.T) {
	refundRows := []tradeBillRow{{OutTradeNo: "ST9", RefundStatus: "CLOSED"}}
	result, _ := compareTradeBill([]tradeBillRow{{OutTradeNo: "EXTERNAL", Status: "SUCCESS"}}, refundRows, nil, nil, "run-1")
	if result.BillRows != 2 {
		t.Fatalf("BillRows = %d, want 2 (success + refund rows)", result.BillRows)
	}
}

func TestReconciliationRefundBillUnavailableItem(t *testing.T) {
	item := reconciliationRefundBillUnavailableItem("run-1", errors.New("申请微信交易账单: boom"))
	if item.Category != reconciliationCategoryRefundBillUnavailable || item.RunID != "run-1" || !strings.Contains(item.Detail, "boom") {
		t.Fatalf("item = %#v", item)
	}
	long := reconciliationRefundBillUnavailableItem("run-1", errors.New(strings.Repeat("x", 400)))
	if strings.Count(long.Detail, "x") != 200 {
		t.Fatalf("detail not truncated to 200 bytes of error text: %q", long.Detail)
	}
}

func TestWechatBillNotExistIsClassifiedStructurally(t *testing.T) {
	if !wechatBillNotExist(&core.APIError{StatusCode: http.StatusNotFound, Code: "NO_BILL_EXIST"}) {
		t.Fatal("404 NO_BILL_EXIST not recognised")
	}
	if !wechatBillNotExist(fmt.Errorf("申请微信交易账单: %w", &core.APIError{StatusCode: http.StatusBadRequest, Code: "no_bill_exist"})) {
		t.Fatal("wrapped NO_BILL_EXIST not recognised")
	}
	if wechatBillNotExist(&core.APIError{StatusCode: http.StatusInternalServerError, Code: "SYSTEM_ERROR"}) {
		t.Fatal("500 SYSTEM_ERROR classified as a missing bill")
	}
	if wechatBillNotExist(errors.New(`error http response:[StatusCode: 404 Code: "NO_BILL_EXIST"]`)) {
		t.Fatal("error text must not be sniffed for the missing-bill case")
	}
}

func TestWechatDownloadTradeBillRejectsUnknownBillType(t *testing.T) {
	provider := &wechatPayBillProvider{}
	for _, billType := range []string{"", "ALL", "RECHARGE_REFUND", "SUCCESS;DROP"} {
		if _, err := provider.DownloadTradeBill(context.Background(), "2026-08-31", billType, io.Discard); err == nil || err.Error() != "微信交易账单类型无效" {
			t.Fatalf("DownloadTradeBill(%q) error = %v, want 微信交易账单类型无效", billType, err)
		}
	}
}
