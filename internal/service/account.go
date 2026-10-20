package service

import (
	"net/http"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
)

type AccountConfig interface {
	AutoRemoveInvalidAccounts() bool
	AutoRemoveRateLimitedAccounts() bool
}

type imageAccountConcurrencyConfig interface {
	ImageAccountConcurrency() int
}

type AccountService struct {
	mu      sync.Mutex
	storage storage.Backend
	config  AccountConfig
	proxy   *ProxyService
	logs    *LogService
	index   int
	items   []Account
	// storeReady is false when the initial (or last full) load failed. Saves are refused
	// so a transient read error cannot wipe the entire account pool.
	storeReady              bool
	imageReservations       map[string]int
	imageCooldownUntil      map[string]time.Time
	imageModelCooldownUntil map[string]time.Time
	imageLeases             map[string]time.Time
	imageProbeAt            map[string]time.Time
	poolOpCounts            map[string]int
	poolOpDay               string
	scheduleStrategy        AccountScheduleStrategy
	quarantinePath          string
	quarantineMu            sync.Mutex
	quarantineCache         []quarantineEntry // under quarantineMu; valid when quarantineCacheOK
	quarantineCacheOK       bool
	quarantineMaxEntries    int // resolved cap (default/env); 0 → resolve on use
	remoteBaseURL           string
	browserHTTPClient       func(profile string, timeout time.Duration) *http.Client
}

const (
	defaultRemoteUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
	defaultRemoteSecCHUA   = `"Chromium";v="146", "Google Chrome";v="146", "Not/A)Brand";v="99"`
	defaultRemoteProfile   = "chrome146"
)

func NewAccountService(backend storage.Backend, config AccountConfig, proxy *ProxyService, logs *LogService) *AccountService {
	browserHTTPClient := func(profile string, timeout time.Duration) *http.Client {
		if proxy == nil {
			return &http.Client{Timeout: timeout}
		}
		return proxy.BrowserHTTPClientWithProfile(profile, timeout)
	}
	s := &AccountService{
		storage:            backend,
		config:             config,
		proxy:              proxy,
		logs:               logs,
		imageReservations:  map[string]int{},
		imageCooldownUntil: map[string]time.Time{},
		imageProbeAt:       map[string]time.Time{},
		remoteBaseURL:      "https://chatgpt.com",
		browserHTTPClient:  browserHTTPClient,
	}
	s.items, s.storeReady = s.loadAccounts()
	return s
}

// autoRemoveInvalidAccounts / autoRemoveRateLimitedAccounts are the only readers of the
// optional pool config: NewAccountService accepts a nil config (embedders and tests do),
// so a direct s.config dereference can panic. nil config means "both toggles off".
func (s *AccountService) autoRemoveInvalidAccounts() bool {
	if s == nil || s.config == nil {
		return false
	}
	return s.config.AutoRemoveInvalidAccounts()
}

func (s *AccountService) autoRemoveRateLimitedAccounts() bool {
	if s == nil || s.config == nil {
		return false
	}
	return s.config.AutoRemoveRateLimitedAccounts()
}

// StoreReady reports whether the account pool was loaded successfully from storage.
