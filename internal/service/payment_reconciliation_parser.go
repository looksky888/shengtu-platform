package service

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

type tradeBillRow struct {
	OutTradeNo, TransactionID, Status, Currency string
	AmountFen                                   int64
}

func parseTradeBillFile(path string) ([]tradeBillRow, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := csv.NewReader(file)
	reader.ReuseRecord = true
	reader.FieldsPerRecord = -1
	header, err := findTradeBillHeader(reader)
	if err != nil {
		return nil, err
	}
	indexes := map[string]int{}
	for i, value := range header {
		indexes[value] = i
	}
	orderIndex, ok := firstIndex(indexes, "商户订单号")
	if !ok {
		return nil, errors.New("微信交易账单缺少商户订单号字段")
	}
	transactionIndex, okTransaction := firstIndex(indexes, "微信订单号")
	if !okTransaction {
		transactionIndex = -1
	}
	statusIndex, okStatus := firstIndex(indexes, "交易状态")
	if !okStatus {
		statusIndex = -1
	}
	currencyIndex, okCurrency := firstIndex(indexes, "货币种类")
	if !okCurrency {
		currencyIndex = -1
	}
	amountIndex, ok := firstIndex(indexes, "订单金额", "总金额", "应结订单金额")
	if !ok {
		return nil, errors.New("微信交易账单缺少金额字段")
	}
	rows := make([]tradeBillRow, 0)
	for len(rows) < maxReconciliationBillRows {
		record, readErr := reader.Read()
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return nil, readErr
		}
		if len(record) == 0 || strings.HasPrefix(normalizeTradeBillCell(record[0]), "总交易单数") {
			break
		}
		get := func(index int) string {
			if index < 0 || index >= len(record) {
				return ""
			}
			return normalizeTradeBillCell(record[index])
		}
		orderNo := get(orderIndex)
		if orderNo == "" {
			continue
		}
		amount, err := parseYuanToFen(get(amountIndex))
		if err != nil {
			return nil, fmt.Errorf("账单订单 %s 金额无效: %w", orderNo, err)
		}
		rows = append(rows, tradeBillRow{OutTradeNo: orderNo, TransactionID: get(transactionIndex), Status: get(statusIndex), Currency: get(currencyIndex), AmountFen: amount})
	}
	if len(rows) == maxReconciliationBillRows {
		return nil, errors.New("微信交易账单超过 1000000 行限制")
	}
	return rows, nil
}

func findTradeBillHeader(reader *csv.Reader) ([]string, error) {
	const maxHeaderRows = 10
	for row := 0; row < maxHeaderRows; row++ {
		record, err := reader.Read()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, err
		}
		for i := range record {
			record[i] = normalizeTradeBillCell(record[i])
		}
		indexes := make(map[string]int, len(record))
		for i, value := range record {
			indexes[value] = i
		}
		_, hasOrder := firstIndex(indexes, "商户订单号")
		_, hasAmount := firstIndex(indexes, "订单金额", "总金额", "应结订单金额")
		if hasOrder && hasAmount {
			return append([]string(nil), record...), nil
		}
	}
	return nil, errors.New("微信交易账单缺少明细表头")
}

func firstIndex(indexes map[string]int, names ...string) (int, bool) {
	for _, name := range names {
		if index, ok := indexes[name]; ok {
			return index, true
		}
	}
	return -1, false
}

func normalizeTradeBillCell(value string) string {
	return strings.Trim(strings.TrimSpace(strings.TrimPrefix(value, "\ufeff")), "`")
}

func parseYuanToFen(value string) (int64, error) {
	value = strings.ReplaceAll(strings.TrimSpace(strings.Trim(value, "`")), ",", "")
	negative := strings.HasPrefix(value, "-")
	if negative {
		value = strings.TrimPrefix(value, "-")
	}
	whole, fraction, _ := strings.Cut(value, ".")
	if whole == "" {
		whole = "0"
	}
	if len(fraction) > 2 {
		return 0, errors.New("金额最多保留两位小数")
	}
	for len(fraction) < 2 {
		fraction += "0"
	}
	yuan, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, err
	}
	fen, err := strconv.ParseInt(fraction, 10, 64)
	if err != nil {
		return 0, err
	}
	amount := yuan*100 + fen
	if negative {
		amount = -amount
	}
	return amount, nil
}
