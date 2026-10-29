package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	maxPendingCreditRefunds = 10000
	maxCreditRefundFileSize = 8 << 20
)

type CreditRefundIntent struct {
	UserID    string `json:"user_id"`
	Amount    int    `json:"amount"`
	Reason    string `json:"reason"`
	RefID     string `json:"ref_id"`
	CreatedAt string `json:"created_at"`
}

type CreditRefundRetrySummary struct {
	Scanned  int
	Refunded int
	Failed   int
}

type creditRefundApplier interface {
	AddOnce(userID string, amount int, reason, refID string) (CreditAccount, CreditLedgerEntry, bool, error)
}

type CreditRefundQueue struct {
	mu      sync.Mutex
	path    string
	credits creditRefundApplier
	pending map[string]CreditRefundIntent
}

type creditRefundQueueFile struct {
	Items []CreditRefundIntent `json:"items"`
}

func NewCreditRefundQueue(dataDir string, credits *CreditService) (*CreditRefundQueue, error) {
	return newCreditRefundQueue(dataDir, credits)
}

func newCreditRefundQueue(dataDir string, credits creditRefundApplier) (*CreditRefundQueue, error) {
	if strings.TrimSpace(dataDir) == "" || credits == nil {
		return nil, fmt.Errorf("初始化积分退款队列需要数据目录与积分服务")
	}
	queue := &CreditRefundQueue{
		path:    filepath.Join(dataDir, "credits", "pending_refunds.json"),
		credits: credits,
		pending: map[string]CreditRefundIntent{},
	}
	if err := queue.load(); err != nil {
		return nil, err
	}
	return queue, nil
}

func (q *CreditRefundQueue) Refund(intent CreditRefundIntent) error {
	intent, err := normalizeCreditRefundIntent(intent)
	if err != nil {
		return err
	}
	key := creditRefundIntentKey(intent)

	q.mu.Lock()
	defer q.mu.Unlock()
	if existing, ok := q.pending[key]; ok {
		if existing.Amount != intent.Amount {
			return fmt.Errorf("退款待办金额冲突: ref_id=%s", intent.RefID)
		}
		return q.applyLocked(key, existing)
	}
	if len(q.pending) >= maxPendingCreditRefunds {
		return q.applyWithoutQueue(intent, errors.New("积分退款待办队列已满"))
	}
	q.pending[key] = intent
	if err := q.persistLocked(); err != nil {
		delete(q.pending, key)
		return q.applyWithoutQueue(intent, fmt.Errorf("持久化积分退款待办: %w", err))
	}
	return q.applyLocked(key, intent)
}

func (q *CreditRefundQueue) RetryPending() (CreditRefundRetrySummary, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	keys := make([]string, 0, len(q.pending))
	for key := range q.pending {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	summary := CreditRefundRetrySummary{Scanned: len(keys)}
	var retryErr error
	for _, key := range keys {
		intent, ok := q.pending[key]
		if !ok {
			continue
		}
		if err := q.applyLocked(key, intent); err != nil {
			summary.Failed++
			retryErr = errors.Join(retryErr, err)
			continue
		}
		summary.Refunded++
	}
	return summary, retryErr
}

func (q *CreditRefundQueue) PendingCount() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.pending)
}

func (q *CreditRefundQueue) applyLocked(key string, intent CreditRefundIntent) error {
	if _, _, _, err := q.credits.AddOnce(intent.UserID, intent.Amount, intent.Reason, intent.RefID); err != nil {
		return fmt.Errorf("执行积分退款: %w", err)
	}
	delete(q.pending, key)
	if err := q.persistLocked(); err != nil {
		q.pending[key] = intent
		return fmt.Errorf("清理积分退款待办: %w", err)
	}
	return nil
}

func (q *CreditRefundQueue) applyWithoutQueue(intent CreditRefundIntent, queueErr error) error {
	if _, _, _, err := q.credits.AddOnce(intent.UserID, intent.Amount, intent.Reason, intent.RefID); err != nil {
		return errors.Join(queueErr, fmt.Errorf("执行积分退款: %w", err))
	}
	return nil
}

func (q *CreditRefundQueue) load() error {
	info, err := os.Stat(q.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("读取积分退款待办状态: %w", err)
	}
	if info.Size() > maxCreditRefundFileSize {
		return fmt.Errorf("积分退款待办文件超过 %d 字节", maxCreditRefundFileSize)
	}
	raw, err := os.ReadFile(q.path)
	if err != nil {
		return fmt.Errorf("读取积分退款待办文件: %w", err)
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return fmt.Errorf("积分退款待办文件为空")
	}
	var state creditRefundQueueFile
	if err := json.Unmarshal(raw, &state); err != nil {
		return fmt.Errorf("解析积分退款待办文件: %w", err)
	}
	if len(state.Items) > maxPendingCreditRefunds {
		return fmt.Errorf("积分退款待办数量超过 %d", maxPendingCreditRefunds)
	}
	for _, item := range state.Items {
		item, err = normalizeCreditRefundIntent(item)
		if err != nil {
			return fmt.Errorf("积分退款待办记录无效: %w", err)
		}
		key := creditRefundIntentKey(item)
		if existing, ok := q.pending[key]; ok && existing.Amount != item.Amount {
			return fmt.Errorf("积分退款待办记录冲突: ref_id=%s", item.RefID)
		}
		q.pending[key] = item
	}
	return nil
}

func (q *CreditRefundQueue) persistLocked() error {
	keys := make([]string, 0, len(q.pending))
	for key := range q.pending {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	items := make([]CreditRefundIntent, 0, len(keys))
	for _, key := range keys {
		items = append(items, q.pending[key])
	}
	raw, err := json.MarshalIndent(creditRefundQueueFile{Items: items}, "", "  ")
	if err != nil {
		return err
	}
	return storage.AtomicWriteFile(q.path, append(raw, '\n'), 0o600)
}

func normalizeCreditRefundIntent(intent CreditRefundIntent) (CreditRefundIntent, error) {
	intent.UserID = util.Clean(intent.UserID)
	intent.Reason = util.Clean(intent.Reason)
	intent.RefID = util.Clean(intent.RefID)
	intent.CreatedAt = strings.TrimSpace(intent.CreatedAt)
	if intent.UserID == "" || intent.Reason == "" || intent.RefID == "" || intent.Amount <= 0 {
		return CreditRefundIntent{}, fmt.Errorf("退款待办缺少 user_id、reason、ref_id 或有效金额")
	}
	if intent.CreatedAt == "" {
		intent.CreatedAt = util.NowISO()
	}
	return intent, nil
}

func creditRefundIntentKey(intent CreditRefundIntent) string {
	return intent.UserID + "\x00" + intent.Reason + "\x00" + intent.RefID
}
