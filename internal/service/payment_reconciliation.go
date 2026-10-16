package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"github.com/google/uuid"
)

const maxReconciliationBillRows = 1_000_000

// StartDailyReconciliation runs after the daily bill availability window. The
// persisted unique (channel,date) key makes restarts and repeated ticks safe.
func (s *PaymentService) StartDailyReconciliation(ctx context.Context, observer func(storage.PaymentReconciliationRunRecord, error)) {
	if s == nil || !s.Available() || s.billProvider == nil || ctx == nil {
		return
	}
	if _, ok := s.backend.(storage.PaymentReconciliationBackend); !ok {
		return
	}
	s.reconciliationOnce.Do(func() {
		recon := s.backend.(storage.PaymentReconciliationBackend)
		if _, err := recon.ResetInterruptedPaymentReconciliations(s.now().UTC().Format(time.RFC3339Nano)); err != nil {
			if observer != nil {
				observer(storage.PaymentReconciliationRunRecord{}, err)
			}
		}
		s.startReconciliationWorker(func() {
			lastDate := ""
			run := func() {
				location := time.FixedZone("CST", 8*60*60)
				now := s.now().In(location)
				if now.Hour() < 10 || (now.Hour() == 10 && now.Minute() < 5) {
					return
				}
				billDate := now.AddDate(0, 0, -1).Format("2006-01-02")
				if billDate == lastDate {
					return
				}
				channels, err := s.backend.LoadActivePaymentChannels()
				if err != nil {
					if observer != nil {
						observer(storage.PaymentReconciliationRunRecord{}, err)
					}
					return
				}
				allSucceeded := len(channels) > 0
				for _, channel := range channels {
					if channel.Provider != storage.PaymentProviderWechatPay {
						continue
					}
					if ctx.Err() != nil {
						return
					}
					run, runErr := s.ReconcileTradeBill(ctx, channel.ID, billDate)
					if runErr != nil {
						allSucceeded = false
					}
					if observer != nil && (runErr != nil || run.Status == storage.PaymentReconciliationStatusSucceeded) {
						observer(run, runErr)
					}
				}
				if allSucceeded {
					lastDate = billDate
				}
			}
			run()
			ticker := time.NewTicker(time.Hour)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					run()
				}
			}
		})
	})
}

type PaymentBillReconciliationPublic struct {
	Run      PaymentReconciliationRunPublic    `json:"run"`
	Items    []PaymentReconciliationItemPublic `json:"items"`
	Total    int                               `json:"total"`
	Page     int                               `json:"page"`
	PageSize int                               `json:"page_size"`
}

type PaymentReconciliationRunPublic struct {
	ID                 string `json:"id"`
	ChannelID          string `json:"channel_id"`
	ChannelVersionID   string `json:"channel_version_id"`
	BillDate           string `json:"bill_date"`
	Status             string `json:"status"`
	BillRows           int    `json:"bill_rows"`
	MatchedOrders      int    `json:"matched_orders"`
	MissingLocalOrders int    `json:"missing_local_orders"`
	MissingBillOrders  int    `json:"missing_bill_orders"`
	AmountMismatches   int    `json:"amount_mismatches"`
	StatusMismatches   int    `json:"status_mismatches"`
	SkippedExternal    int    `json:"skipped_external"`
	LastError          string `json:"last_error,omitempty"`
	StartedAt          string `json:"started_at,omitempty"`
	FinishedAt         string `json:"finished_at,omitempty"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

type PaymentReconciliationItemPublic struct {
	ID             string `json:"id"`
	RunID          string `json:"run_id"`
	Category       string `json:"category"`
	OutTradeNo     string `json:"out_trade_no"`
	TransactionID  string `json:"transaction_id,omitempty"`
	LocalOrderID   string `json:"local_order_id,omitempty"`
	BillAmountFen  int64  `json:"bill_amount_fen"`
	LocalAmountFen int64  `json:"local_amount_fen"`
	Detail         string `json:"detail"`
	CreatedAt      string `json:"created_at"`
}

type PaymentReconciliationPage struct {
	Items    []PaymentReconciliationRunPublic `json:"items"`
	Total    int                              `json:"total"`
	Page     int                              `json:"page"`
	PageSize int                              `json:"page_size"`
}

func (s *PaymentService) QueryReconciliations(filter storage.PaymentReconciliationFilter) (PaymentReconciliationPage, error) {
	recon, ok := s.reconciliationBackend()
	if !ok {
		return PaymentReconciliationPage{}, errors.New("当前存储后端不支持账单对账")
	}
	filter.Page, filter.PageSize = normalizeReconciliationPage(filter.Page, filter.PageSize)
	filter.Status = strings.ToLower(strings.TrimSpace(filter.Status))
	if filter.Status != "" && filter.Status != storage.PaymentReconciliationStatusPending && filter.Status != storage.PaymentReconciliationStatusRunning && filter.Status != storage.PaymentReconciliationStatusSucceeded && filter.Status != storage.PaymentReconciliationStatusFailed {
		return PaymentReconciliationPage{}, errors.New("对账状态筛选无效")
	}
	if filter.BillDate != "" {
		if err := validateBillDate(filter.BillDate); err != nil {
			return PaymentReconciliationPage{}, err
		}
	}
	items, total, err := recon.QueryPaymentReconciliationRuns(filter)
	if err != nil {
		return PaymentReconciliationPage{}, err
	}
	out := make([]PaymentReconciliationRunPublic, 0, len(items))
	for _, item := range items {
		out = append(out, publicPaymentReconciliationRun(item))
	}
	return PaymentReconciliationPage{Items: out, Total: total, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (s *PaymentService) GetReconciliation(id string, filter storage.PaymentReconciliationItemFilter) (PaymentBillReconciliationPublic, error) {
	recon, ok := s.reconciliationBackend()
	if !ok {
		return PaymentBillReconciliationPublic{}, errors.New("当前存储后端不支持账单对账")
	}
	filter.Page, filter.PageSize = normalizeReconciliationPage(filter.Page, filter.PageSize)
	run, err := recon.LoadPaymentReconciliationRun(strings.TrimSpace(id))
	if err != nil {
		return PaymentBillReconciliationPublic{}, err
	}
	items, total, err := recon.QueryPaymentReconciliationItems(run.ID, filter)
	if err != nil {
		return PaymentBillReconciliationPublic{}, err
	}
	out := make([]PaymentReconciliationItemPublic, 0, len(items))
	for _, item := range items {
		out = append(out, publicPaymentReconciliationItem(item))
	}
	return PaymentBillReconciliationPublic{Run: publicPaymentReconciliationRun(run), Items: out, Total: total, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (s *PaymentService) TriggerTradeBillReconciliation(ctx context.Context, channelID, billDate string) (PaymentReconciliationRunPublic, error) {
	if ctx == nil {
		return PaymentReconciliationRunPublic{}, errors.New("对账任务上下文无效")
	}
	run, err := s.prepareTradeBillReconciliation(channelID, billDate)
	if err != nil {
		return PaymentReconciliationRunPublic{}, err
	}
	if run.Status == storage.PaymentReconciliationStatusPending || run.Status == storage.PaymentReconciliationStatusFailed {
		started := s.startReconciliationWorker(func() {
			workerCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			defer cancel()
			_, _ = s.ReconcileTradeBill(workerCtx, channelID, billDate)
		})
		if !started {
			return PaymentReconciliationRunPublic{}, errors.New("支付对账服务正在关闭")
		}
	}
	return publicPaymentReconciliationRun(run), nil
}

func (s *PaymentService) ReconcileTradeBill(ctx context.Context, channelID, billDate string) (storage.PaymentReconciliationRunRecord, error) {
	if s == nil || s.backend == nil || s.billProvider == nil {
		return storage.PaymentReconciliationRunRecord{}, errors.New("账单对账服务尚未就绪")
	}
	recon, ok := s.reconciliationBackend()
	if !ok {
		return storage.PaymentReconciliationRunRecord{}, errors.New("当前存储后端不支持账单对账")
	}
	run, created, version, credentials, err := s.prepareTradeBillReconciliationWithCredentials(channelID, billDate)
	if err != nil {
		return storage.PaymentReconciliationRunRecord{}, err
	}
	if !created {
		if run.Status == storage.PaymentReconciliationStatusSucceeded {
			return run, nil
		}
		if run.Status == storage.PaymentReconciliationStatusRunning {
			return run, errors.New("该日期账单对账正在执行")
		}
	}
	now := s.now().UTC()
	claimed, err := recon.ClaimPaymentReconciliationRun(run.ID, now.Format(time.RFC3339Nano))
	if err != nil {
		return run, err
	}
	if !claimed {
		return recon.LoadPaymentReconciliationRun(run.ID)
	}
	if err := os.MkdirAll(s.billDir, 0o700); err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	tmp, err := os.CreateTemp(s.billDir, ".bill-*.csv")
	if err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	provider, err := s.billProvider(ctx, credentials)
	if err != nil {
		_ = tmp.Close()
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	download, err := provider.DownloadTradeBill(ctx, billDate, tmp)
	if err == nil {
		err = tmp.Sync()
	}
	closeErr := tmp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	parsed, err := parseTradeBillFile(tmpPath)
	if err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	paidStart, paidEnd := billDateRange(billDate)
	billOrderNumbers := make([]string, 0, len(parsed))
	for _, row := range parsed {
		if strings.HasPrefix(row.OutTradeNo, "ST") {
			billOrderNumbers = append(billOrderNumbers, row.OutTradeNo)
		}
	}
	billOrders, err := recon.LoadPaymentOrdersByOutTradeNos(billOrderNumbers)
	if err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	dayOrders, err := recon.ListSucceededPaymentOrdersForReconciliation(channelID, paidStart, paidEnd)
	if err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	result, items := compareTradeBill(parsed, billOrders, dayOrders, run.ID)
	archiveDir := filepath.Join(s.billDir, channelID, billDate[:4])
	if err := os.MkdirAll(archiveDir, 0o700); err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	archivePath := filepath.Join(archiveDir, billDate+".csv")
	if err := os.Rename(tmpPath, archivePath); err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	result.ID, result.ChannelID, result.ChannelVersionID, result.BillDate = run.ID, channelID, version.ID, billDate
	result.Status, result.ArchivePath, result.HashType, result.HashValue = storage.PaymentReconciliationStatusSucceeded, archivePath, download.HashType, download.HashValue
	result.CreatedAt, result.UpdatedAt, result.FinishedAt = run.CreatedAt, s.now().UTC().Format(time.RFC3339Nano), s.now().UTC().Format(time.RFC3339Nano)
	if err := recon.CompletePaymentReconciliationRun(result, items); err != nil {
		_ = recon.FailPaymentReconciliationRun(run.ID, err.Error(), s.now().UTC().Format(time.RFC3339Nano))
		return run, err
	}
	return recon.LoadPaymentReconciliationRun(run.ID)
}

func (s *PaymentService) prepareTradeBillReconciliation(channelID, billDate string) (storage.PaymentReconciliationRunRecord, error) {
	run, _, _, _, err := s.prepareTradeBillReconciliationWithCredentials(channelID, billDate)
	return run, err
}

func (s *PaymentService) prepareTradeBillReconciliationWithCredentials(channelID, billDate string) (storage.PaymentReconciliationRunRecord, bool, storage.PaymentChannelVersionRecord, paymentRuntimeCredentials, error) {
	recon, ok := s.reconciliationBackend()
	if !ok {
		return storage.PaymentReconciliationRunRecord{}, false, storage.PaymentChannelVersionRecord{}, paymentRuntimeCredentials{}, errors.New("当前存储后端不支持账单对账")
	}
	channelID, billDate = strings.TrimSpace(channelID), strings.TrimSpace(billDate)
	if err := validateBillDateForNow(billDate, s.now()); err != nil {
		return storage.PaymentReconciliationRunRecord{}, false, storage.PaymentChannelVersionRecord{}, paymentRuntimeCredentials{}, err
	}
	version, credentials, err := s.loadCredentialsForChannel(channelID)
	if err != nil {
		return storage.PaymentReconciliationRunRecord{}, false, storage.PaymentChannelVersionRecord{}, paymentRuntimeCredentials{}, err
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	run, created, err := recon.CreateOrLoadPaymentReconciliationRun(storage.PaymentReconciliationRunRecord{ID: uuid.NewString(), ChannelID: channelID, ChannelVersionID: version.ID, BillDate: billDate, Status: storage.PaymentReconciliationStatusPending, CreatedAt: now, UpdatedAt: now})
	return run, created, version, credentials, err
}

func (s *PaymentService) reconciliationBackend() (storage.PaymentReconciliationBackend, bool) {
	if s == nil || s.backend == nil || s.billProvider == nil {
		return nil, false
	}
	recon, ok := s.backend.(storage.PaymentReconciliationBackend)
	return recon, ok
}

func normalizeReconciliationPage(page, pageSize int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 25
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func publicPaymentReconciliationRun(item storage.PaymentReconciliationRunRecord) PaymentReconciliationRunPublic {
	return PaymentReconciliationRunPublic{ID: item.ID, ChannelID: item.ChannelID, ChannelVersionID: item.ChannelVersionID, BillDate: item.BillDate, Status: item.Status, BillRows: item.BillRows, MatchedOrders: item.MatchedOrders, MissingLocalOrders: item.MissingLocalOrders, MissingBillOrders: item.MissingBillOrders, AmountMismatches: item.AmountMismatches, StatusMismatches: item.StatusMismatches, SkippedExternal: item.SkippedExternal, LastError: item.LastError, StartedAt: item.StartedAt, FinishedAt: item.FinishedAt, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
}

func publicPaymentReconciliationItem(item storage.PaymentReconciliationItemRecord) PaymentReconciliationItemPublic {
	return PaymentReconciliationItemPublic{ID: item.ID, RunID: item.RunID, Category: item.Category, OutTradeNo: item.OutTradeNo, TransactionID: item.TransactionID, LocalOrderID: item.LocalOrderID, BillAmountFen: item.BillAmountFen, LocalAmountFen: item.LocalAmountFen, Detail: item.Detail, CreatedAt: item.CreatedAt}
}

func (s *PaymentService) CloseReconciliation(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.reconciliationMu.Lock()
	s.reconciliationStop = true
	s.reconciliationMu.Unlock()
	done := make(chan struct{})
	go func() { s.reconciliationWG.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("等待支付对账任务停止: %w", ctx.Err())
	}
}

func (s *PaymentService) loadCredentialsForChannel(channelID string) (storage.PaymentChannelVersionRecord, paymentRuntimeCredentials, error) {
	channels, err := s.backend.LoadActivePaymentChannels()
	if err != nil {
		return storage.PaymentChannelVersionRecord{}, paymentRuntimeCredentials{}, err
	}
	for _, channel := range channels {
		if channel.ID == channelID {
			if channel.Provider != storage.PaymentProviderWechatPay {
				return storage.PaymentChannelVersionRecord{}, paymentRuntimeCredentials{}, errors.New("当前渠道不支持微信交易账单对账")
			}
			return s.loadRuntimeCredentials(channel.ActiveVersionID)
		}
	}
	return storage.PaymentChannelVersionRecord{}, paymentRuntimeCredentials{}, storage.ErrPaymentRecordNotFound
}
