package app

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	appleAuthUserAgent              = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15"
	defaultAppleOAuthClientID       = "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d"
	appleAccountManageOAuthClientID = "af1139274f266b22b68c2a3e7ad932cb3c0bbe854e13a79af78dcc73136882c3"
	appleHashcashMaxBits            = 24
	appleHashcashMaxAttempts        = 1 << 24
)

const (
	appleTwoFactorMethodTrustedDevice = "trusted_device"
	appleTwoFactorMethodPhone         = "phone"
)

func normalizeAppleTwoFactorMethod(method string) string {
	switch strings.ToLower(strings.TrimSpace(method)) {
	case appleTwoFactorMethodPhone, "sms", "phone_sms", "trusted_phone", "trusted_phone_number":
		return appleTwoFactorMethodPhone
	default:
		return appleTwoFactorMethodTrustedDevice
	}
}

type AppleAuthClient struct {
	httpClient *http.Client
}

type appleAuthEndpoints struct {
	Home  string
	Setup string
	Auth  string
	Host  string
}

type appleAuthSession struct {
	Endpoints           appleAuthEndpoints
	AppleID             string
	ClientID            string
	FrameID             string
	UserAgent           string
	SessionToken        string
	Scnt                string
	ManageScnt          string
	SessionID           string
	AccountCountry      string
	TrustToken          string
	AuthAttributes      string
	HCBits              int
	HCChallenge         string
	CompleteHCBits      int
	CompleteHCChallenge string
	TwoFactorPhone      json.RawMessage
	TwoFactorMethod     string
	Cookies             []SessionCookie
}

type appleSRPInitResponse struct {
	Iteration int    `json:"iteration"`
	Salt      string `json:"salt"`
	Protocol  string `json:"protocol"`
	B         string `json:"b"`
	C         string `json:"c"`
}

type appleAuthStartResult struct {
	Session   ICloudSession
	PendingID string
	Needs2FA  bool
	Message   string
	AppleID   string
	ExpiresAt time.Time
}

type appleDomainRedirectError struct {
	DomainToUse string
	Host        string
}

func (e appleDomainRedirectError) Error() string {
	if e.Host != "" {
		return "Apple 要求切换 iCloud 域：" + e.Host
	}
	return "Apple 要求切换 iCloud 域：" + e.DomainToUse
}

type appleAccountInfo struct {
	DSInfo struct {
		DSID                            string `json:"dsid"`
		AppleID                         string `json:"appleId"`
		PrimaryEmail                    string `json:"primaryEmail"`
		IsHideMyEmailSubscriptionActive bool   `json:"isHideMyEmailSubscriptionActive"`
		IsHideMyEmailFeatureAvailable   bool   `json:"isHideMyEmailFeatureAvailable"`
		HsaVersion                      int    `json:"hsaVersion"`
	} `json:"dsInfo"`
	Webservices map[string]struct {
		URL         string `json:"url"`
		Status      string `json:"status"`
		PcsRequired bool   `json:"pcsRequired"`
	} `json:"webservices"`
	HsaChallengeRequired bool   `json:"hsaChallengeRequired"`
	TermsUpdateNeeded    bool   `json:"termsUpdateNeeded"`
	IsRepairNeeded       bool   `json:"isRepairNeeded"`
	DomainToUse          string `json:"domainToUse"`
}

type appleAuthPending struct {
	ID        string
	Session   *appleAuthSession
	CreatedAt time.Time
	ExpiresAt time.Time
}

type appleAuthPendingStore struct {
	mu    sync.Mutex
	items map[string]appleAuthPending
}

func NewAppleAuthClient() *AppleAuthClient {
	return &AppleAuthClient{httpClient: &http.Client{Timeout: 30 * time.Second}}
}

func newAppleAuthPendingStore() *appleAuthPendingStore {
	return &appleAuthPendingStore{items: make(map[string]appleAuthPending)}
}

func (s *appleAuthPendingStore) put(session *appleAuthSession) (appleAuthPending, error) {
	id, err := randomToken(18)
	if err != nil {
		return appleAuthPending{}, err
	}
	now := time.Now()
	pending := appleAuthPending{
		ID:        id,
		Session:   session,
		CreatedAt: now,
		ExpiresAt: now.Add(10 * time.Minute),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked(now)
	s.items[id] = pending
	return pending, nil
}

func (s *appleAuthPendingStore) get(id string) (appleAuthPending, bool) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked(now)
	pending, ok := s.items[strings.TrimSpace(id)]
	return pending, ok
}

func (s *appleAuthPendingStore) delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.items, strings.TrimSpace(id))
}

func (s *appleAuthPendingStore) cleanupLocked(now time.Time) {
	for id, pending := range s.items {
		if now.After(pending.ExpiresAt) {
			delete(s.items, id)
		}
	}
}
