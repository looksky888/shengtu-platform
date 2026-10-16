package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	registrationQuotaDocumentName     = "registration_quota.json"
	defaultMaxRegistrationQuotaEvents = 5000
	minMaxRegistrationQuotaEvents     = 100
	maxMaxRegistrationQuotaEvents     = 50000
	staleReserveTTL                   = 30 * time.Minute
	deviceCookieName                  = "chatgpt2api_device"
)

type RegistrationRiskInput struct {
	ClientIP string
	DeviceID string
	Email    string
}

// RegistrationQuotaEvent records a successful registration or an in-flight slot.
type RegistrationQuotaEvent struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email,omitempty"`
	ClientIP  string `json:"client_ip"`
	DeviceID  string `json:"device_id,omitempty"`
	CreatedAt string `json:"created_at"`
	ReserveID string `json:"reserve_id,omitempty"`
}

type RegistrationAttempt struct {
	ID        string `json:"id"`
	ClientIP  string `json:"client_ip"`
	DeviceID  string `json:"device_id"`
	Email     string `json:"email,omitempty"`
	CreatedAt string `json:"created_at"`
}

type RegistrationRiskBlock struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Key       string `json:"key"`
	Code      string `json:"code"`
	Reason    string `json:"reason"`
	CreatedAt string `json:"created_at"`
	ExpiresAt string `json:"expires_at"`
}

type registrationQuotaState struct {
	Events   []RegistrationQuotaEvent `json:"events"`
	Attempts []RegistrationAttempt    `json:"attempts"`
	Blocks   []RegistrationRiskBlock  `json:"blocks"`
}

type RegistrationQuotaService struct {
	mu              sync.Mutex
	path            string
	policyPath      string
	docName         string
	store           storage.JSONDocumentBackend
	secret          []byte
	previousSecrets [][]byte
	maxEvents       int
	policy          RegistrationRiskPolicy
	now             func() time.Time
	state           registrationQuotaState
}

type RegistrationQuotaConfig struct {
	MaxEvents            int
	DeviceSecret         string
	DeviceSecretPrevious string
	Policy               RegistrationRiskPolicy
	Now                  func() time.Time
}

func NewRegistrationQuotaService(dataDir string, backend storage.Backend, cfg RegistrationQuotaConfig) (*RegistrationQuotaService, error) {
	current, err := loadOrCreateDeviceSecret(dataDir, cfg.DeviceSecret)
	if err != nil {
		return nil, err
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	s := &RegistrationQuotaService{
		path:            filepath.Join(dataDir, registrationQuotaDocumentName),
		policyPath:      filepath.Join(dataDir, registrationRiskPolicyDocumentName),
		docName:         registrationQuotaDocumentName,
		store:           jsonDocumentStoreFromBackend(backend),
		maxEvents:       resolveRegistrationQuotaMaxEvents(cfg.MaxEvents),
		secret:          current,
		previousSecrets: loadPreviousDeviceSecrets(cfg.DeviceSecretPrevious, current),
		now:             now,
	}
	if err := s.loadPolicy(); err != nil {
		return nil, err
	}
	if registrationRiskPolicyConfigured(cfg.Policy) {
		policy, err := normalizeRegistrationRiskPolicy(cfg.Policy)
		if err != nil {
			return nil, fmt.Errorf("注册风控配置无效: %w", err)
		}
		s.policy = policy
	}
	state, err := s.load()
	if err != nil {
		return nil, fmt.Errorf("加载注册风控账本: %w", err)
	}
	s.state = state
	s.mu.Lock()
	if s.pruneStateLocked(s.now()) > 0 {
		if err := s.persistLocked(); err != nil {
			s.mu.Unlock()
			return nil, fmt.Errorf("保存清理后的注册风控账本: %w", err)
		}
	}
	s.mu.Unlock()
	return s, nil
}

func registrationRiskPolicyConfigured(policy RegistrationRiskPolicy) bool {
	return policy.Enabled || policy.DeviceSuccessLimit > 0 || policy.IPSuccessLimit > 0 ||
		policy.PairAttemptLimit > 0 || policy.SubnetSuccessLimit > 0 ||
		policy.DisposableDomains != nil || policy.ProxyCIDRs != nil
}

func resolveRegistrationQuotaMaxEvents(explicit int) int {
	if explicit > 0 {
		return clampRegistrationQuotaMaxEvents(explicit)
	}
	raw := strings.TrimSpace(os.Getenv("CHATGPT2API_REGISTER_QUOTA_MAX_EVENTS"))
	n, err := strconv.Atoi(raw)
	if raw == "" || err != nil || n <= 0 {
		return defaultMaxRegistrationQuotaEvents
	}
	return clampRegistrationQuotaMaxEvents(n)
}

func clampRegistrationQuotaMaxEvents(n int) int {
	if n < minMaxRegistrationQuotaEvents {
		return minMaxRegistrationQuotaEvents
	}
	if n > maxMaxRegistrationQuotaEvents {
		return maxMaxRegistrationQuotaEvents
	}
	return n
}

func (s *RegistrationQuotaService) Check(input RegistrationRiskInput) error {
	if s == nil {
		return nil
	}
	input = normalizeRegistrationRiskInput(input)
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.checkRiskLocked(input, s.now(), false)
}

// Reserve records one registration submission and atomically holds a quota slot.
func (s *RegistrationQuotaService) Reserve(input RegistrationRiskInput) (string, error) {
	if s == nil {
		return "noop", nil
	}
	input = normalizeRegistrationRiskInput(input)
	s.mu.Lock()
	defer s.mu.Unlock()

	previous := cloneRegistrationQuotaState(s.state)
	now := s.now()
	s.pruneStateLocked(now)
	if err := s.checkRiskLocked(input, now, true); err != nil {
		return "", s.persistRiskDecisionLocked(previous, err)
	}
	if s.policy.Enabled {
		if err := s.recordAttemptAndCheckLocked(input, now); err != nil {
			return "", s.persistRiskDecisionLocked(previous, err)
		}
	}
	reserveID := IssueDeviceID()
	s.state.Events = append(s.state.Events, RegistrationQuotaEvent{
		Email: input.Email, ClientIP: input.ClientIP, DeviceID: input.DeviceID,
		CreatedAt: now.UTC().Format(time.RFC3339Nano), ReserveID: reserveID,
	})
	if err := s.saveLocked(); err != nil {
		s.state = previous
		return "", err
	}
	return reserveID, nil
}

func (s *RegistrationQuotaService) persistRiskDecisionLocked(previous registrationQuotaState, decision error) error {
	if err := s.saveLocked(); err != nil {
		s.state = previous
		return fmt.Errorf("保存注册风控判定: %w", err)
	}
	return decision
}

func normalizeRegistrationRiskInput(input RegistrationRiskInput) RegistrationRiskInput {
	input.ClientIP = NormalizeClientIP(input.ClientIP)
	input.DeviceID = strings.TrimSpace(input.DeviceID)
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	return input
}

func cloneRegistrationQuotaState(value registrationQuotaState) registrationQuotaState {
	return registrationQuotaState{
		Events:   append([]RegistrationQuotaEvent(nil), value.Events...),
		Attempts: append([]RegistrationAttempt(nil), value.Attempts...),
		Blocks:   append([]RegistrationRiskBlock(nil), value.Blocks...),
	}
}

func (s *RegistrationQuotaService) Bind(reserveID, userID, email string) error {
	if s == nil || reserveID == "" || reserveID == "noop" {
		return nil
	}
	userID = util.Clean(userID)
	email = strings.ToLower(strings.TrimSpace(email))
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := cloneRegistrationQuotaState(s.state)
	for i := range s.state.Events {
		if s.state.Events[i].ReserveID != reserveID {
			continue
		}
		s.state.Events[i].UserID = userID
		s.state.Events[i].Email = email
		s.state.Events[i].ReserveID = ""
		if err := s.saveLocked(); err != nil {
			s.state = previous
			return err
		}
		return nil
	}
	s.state.Events = append(s.state.Events, RegistrationQuotaEvent{
		UserID: userID, Email: email, CreatedAt: s.now().UTC().Format(time.RFC3339Nano),
	})
	if err := s.saveLocked(); err != nil {
		s.state = previous
		return err
	}
	return nil
}

func (s *RegistrationQuotaService) Release(reserveID string) error {
	if s == nil || reserveID == "" || reserveID == "noop" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := cloneRegistrationQuotaState(s.state)
	if s.dropReserveLocked(reserveID) {
		if err := s.saveLocked(); err != nil {
			s.state = previous
			return err
		}
	}
	return nil
}

func (s *RegistrationQuotaService) dropReserveLocked(reserveID string) bool {
	next := make([]RegistrationQuotaEvent, 0, len(s.state.Events))
	found := false
	for _, event := range s.state.Events {
		if event.ReserveID == reserveID && util.Clean(event.UserID) == "" {
			found = true
			continue
		}
		next = append(next, event)
	}
	if found {
		s.state.Events = next
	}
	return found
}

func (s *RegistrationQuotaService) RecordSuccess(userID, email, clientIP, deviceID string) error {
	if s == nil {
		return nil
	}
	event := RegistrationQuotaEvent{
		UserID: util.Clean(userID), Email: strings.ToLower(strings.TrimSpace(email)),
		ClientIP: NormalizeClientIP(clientIP), DeviceID: strings.TrimSpace(deviceID),
		CreatedAt: s.now().UTC().Format(time.RFC3339Nano),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Events = append(s.state.Events, event)
	return s.saveLocked()
}

func (s *RegistrationQuotaService) CountForTest(clientIP, deviceID string) (int, int) {
	if s == nil {
		return 0, 0
	}
	input := normalizeRegistrationRiskInput(RegistrationRiskInput{ClientIP: clientIP, DeviceID: deviceID})
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	ipCutoff := now.Add(-time.Duration(s.policy.IPWindowHours) * time.Hour)
	deviceCutoff := now.AddDate(0, 0, -s.policy.DeviceWindowDays)
	return s.successCountLocked(ipCutoff, func(event RegistrationQuotaEvent) bool {
			return input.ClientIP != "" && NormalizeClientIP(event.ClientIP) == input.ClientIP
		}), s.successCountLocked(deviceCutoff, func(event RegistrationQuotaEvent) bool {
			return input.DeviceID != "" && event.DeviceID == input.DeviceID
		})
}
