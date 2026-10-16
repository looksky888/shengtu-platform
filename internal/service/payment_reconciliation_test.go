package service

import (
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestParseYuanToFenExactDecimal(t *testing.T) {
	for _, test := range []struct {
		input string
		want  int64
	}{{"9.76", 976}, {"`1.00", 100}, {"-0.01", -1}} {
		got, err := parseYuanToFen(test.input)
		if err != nil || got != test.want {
			t.Fatalf("parseYuanToFen(%q) = %d, %v; want %d", test.input, got, err, test.want)
		}
	}
	if _, err := parseYuanToFen("1.001"); err == nil {
		t.Fatal("expected more-than-two-decimals error")
	}
}

func TestParseTradeBillFileIgnoresSummaryAndBOM(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bill.csv")
	contents := "\ufeff交易时间,微信订单号,商户订单号,交易状态,货币种类,订单金额\n2026-08-30,wx-1,ST123,SUCCESS,CNY,9.76\n总交易单数,1,,,,9.76\n"
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	rows, err := parseTradeBillFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].OutTradeNo != "ST123" || rows[0].AmountFen != 976 {
		t.Fatalf("rows=%#v", rows)
	}
}

func TestParseTradeBillFileFindsHistoricalHeaderAndUsesOrderAmount(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bill.csv")
	contents := "微信支付交易账单,,,,\n生成时间,2026-08-30,,,\n交易时间,微信订单号,商户订单号,交易状态,货币种类,应结订单金额,总金额\n2026-08-30,wx-1,ST123,SUCCESS,CNY,8.88,9.76\n总交易单数,1,,,,,9.76\n"
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	rows, err := parseTradeBillFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].AmountFen != 976 {
		t.Fatalf("rows=%#v", rows)
	}
}

func TestNormalizePaymentSuccessTimeUsesUTC(t *testing.T) {
	got, err := normalizePaymentSuccessTime("2026-08-30T10:00:00+08:00")
	if err != nil || got != "2026-08-30T02:00:00Z" {
		t.Fatalf("got=%q err=%v", got, err)
	}
	if _, err := normalizePaymentSuccessTime("invalid"); err == nil {
		t.Fatal("expected invalid payment success time error")
	}
}

func TestCompareTradeBillSkipsExternalRowsAndReportsMismatches(t *testing.T) {
	rows := []tradeBillRow{{OutTradeNo: "EXTERNAL", Status: "SUCCESS", Currency: "CNY", AmountFen: 100}, {OutTradeNo: "ST1", TransactionID: "wx-other", Status: "SUCCESS", Currency: "CNY", AmountFen: 101}}
	orders := []storage.PaymentOrderRecord{{ID: "order-1", OutTradeNo: "ST1", TransactionID: "wx-1", Currency: "CNY", AmountFen: 100}}
	result, items := compareTradeBill(rows, orders, orders, "run-1")
	if result.SkippedExternal != 1 || result.AmountMismatches != 1 || result.StatusMismatches != 1 || len(items) != 2 {
		t.Fatalf("result=%#v items=%#v", result, items)
	}
}
