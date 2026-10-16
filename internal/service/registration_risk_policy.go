package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"sort"
	"strings"

	"chatgpt2api/internal/storage"
)

const registrationRiskPolicyDocumentName = "registration_risk_settings.json"

const (
	maxRegistrationRiskLimit   = 100000
	maxRegistrationRiskDays    = 3650
	maxRegistrationRiskHours   = 87600
	maxRegistrationRiskMinutes = 5256000
	maxRegistrationRiskList    = 5000
)

type RegistrationRiskPolicy struct {
	Enabled                  bool     `json:"enabled"`
	DeviceSuccessLimit       int      `json:"device_success_limit"`
	DeviceWindowDays         int      `json:"device_window_days"`
	DeviceBlockHours         int      `json:"device_block_hours"`
	IPSuccessLimit           int      `json:"ip_success_limit"`
	IPDistinctDeviceLimit    int      `json:"ip_distinct_device_limit"`
	IPWindowHours            int      `json:"ip_window_hours"`
	IPBlockHours             int      `json:"ip_block_hours"`
	PairAttemptLimit         int      `json:"pair_attempt_limit"`
	PairAttemptWindowMinutes int      `json:"pair_attempt_window_minutes"`
	PairCooldownHours        int      `json:"pair_cooldown_hours"`
	SubnetSuccessLimit       int      `json:"subnet_success_limit"`
	SubnetWindowHours        int      `json:"subnet_window_hours"`
	DisposableDomains        []string `json:"disposable_domains"`
	ProxyCIDRs               []string `json:"proxy_cidrs"`
}

func DefaultRegistrationRiskPolicy() RegistrationRiskPolicy {
	return RegistrationRiskPolicy{
		Enabled:            true,
		DeviceSuccessLimit: 5, DeviceWindowDays: 30, DeviceBlockHours: 30 * 24,
		IPSuccessLimit: 3, IPDistinctDeviceLimit: 3, IPWindowHours: 24, IPBlockHours: 30,
		PairAttemptLimit: 2, PairAttemptWindowMinutes: 10, PairCooldownHours: 300,
		SubnetSuccessLimit: 20, SubnetWindowHours: 24,
		DisposableDomains: []string{
			"10minutemail.com", "fakemail.net", "guerrillamail.com", "mailinator.com",
			"moakt.com", "temp-mail.org", "throwawaymail.com", "yopmail.com",
		},
		ProxyCIDRs: []string{},
	}
}

func normalizeRegistrationRiskPolicy(value RegistrationRiskPolicy) (RegistrationRiskPolicy, error) {
	if value.DeviceSuccessLimit < 1 || value.DeviceWindowDays < 1 || value.DeviceBlockHours < 1 ||
		value.IPSuccessLimit < 1 || value.IPDistinctDeviceLimit < 1 || value.IPWindowHours < 1 || value.IPBlockHours < 1 ||
		value.PairAttemptLimit < 1 || value.PairAttemptWindowMinutes < 1 || value.PairCooldownHours < 1 ||
		value.SubnetSuccessLimit < 1 || value.SubnetWindowHours < 1 {
		return RegistrationRiskPolicy{}, errors.New("注册风控阈值和时间必须大于 0")
	}
	if value.IPDistinctDeviceLimit > value.IPSuccessLimit {
		return RegistrationRiskPolicy{}, errors.New("IP 不同设备阈值不能大于成功注册阈值")
	}
	if value.DeviceSuccessLimit > maxRegistrationRiskLimit || value.IPSuccessLimit > maxRegistrationRiskLimit ||
		value.IPDistinctDeviceLimit > maxRegistrationRiskLimit || value.PairAttemptLimit > maxRegistrationRiskLimit ||
		value.SubnetSuccessLimit > maxRegistrationRiskLimit || value.DeviceWindowDays > maxRegistrationRiskDays ||
		value.DeviceBlockHours > maxRegistrationRiskHours || value.IPWindowHours > maxRegistrationRiskHours ||
		value.IPBlockHours > maxRegistrationRiskHours || value.PairCooldownHours > maxRegistrationRiskHours ||
		value.SubnetWindowHours > maxRegistrationRiskHours || value.PairAttemptWindowMinutes > maxRegistrationRiskMinutes {
		return RegistrationRiskPolicy{}, errors.New("注册风控阈值或时间超过允许范围")
	}
	if len(value.DisposableDomains) > maxRegistrationRiskList || len(value.ProxyCIDRs) > maxRegistrationRiskList {
		return RegistrationRiskPolicy{}, errors.New("临时邮箱域名或代理 CIDR 数量过多")
	}
	var err error
	value.DisposableDomains, err = normalizeDomainList(value.DisposableDomains)
	if err != nil {
		return RegistrationRiskPolicy{}, err
	}
	value.ProxyCIDRs = normalizeCIDRList(value.ProxyCIDRs)
	for _, cidr := range value.ProxyCIDRs {
		if _, _, err := net.ParseCIDR(cidr); err != nil {
			return RegistrationRiskPolicy{}, fmt.Errorf("代理 CIDR 无效: %s", cidr)
		}
	}
	return value, nil
}

func normalizeDomainList(values []string) ([]string, error) {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(value)), "@")
		value = strings.TrimSuffix(value, ".")
		if value == "" {
			continue
		}
		if strings.ContainsAny(value, "@/\\: \t\r\n") {
			return nil, fmt.Errorf("临时邮箱域名无效: %s", value)
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out, nil
}

func normalizeCIDRList(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if ip := net.ParseIP(value); ip != nil {
			if ip.To4() != nil {
				value += "/32"
			} else {
				value += "/128"
			}
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func (s *RegistrationQuotaService) Policy() RegistrationRiskPolicy {
	if s == nil {
		return DefaultRegistrationRiskPolicy()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneRegistrationRiskPolicy(s.policy)
}

func (s *RegistrationQuotaService) UpdatePolicy(value RegistrationRiskPolicy) (RegistrationRiskPolicy, error) {
	next, err := normalizeRegistrationRiskPolicy(value)
	if err != nil {
		return RegistrationRiskPolicy{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := s.policy
	s.policy = next
	if err := s.persistPolicyLocked(); err != nil {
		s.policy = previous
		return RegistrationRiskPolicy{}, fmt.Errorf("保存注册风控设置: %w", err)
	}
	return cloneRegistrationRiskPolicy(s.policy), nil
}

func cloneRegistrationRiskPolicy(value RegistrationRiskPolicy) RegistrationRiskPolicy {
	value.DisposableDomains = append([]string{}, value.DisposableDomains...)
	value.ProxyCIDRs = append([]string{}, value.ProxyCIDRs...)
	return value
}

func (s *RegistrationQuotaService) loadPolicy() error {
	value := any(nil)
	var err error
	if s.store != nil {
		value, err = s.store.LoadJSONDocument(registrationRiskPolicyDocumentName)
		if err != nil {
			return fmt.Errorf("加载注册风控设置: %w", err)
		}
	}
	if value == nil {
		data, readErr := os.ReadFile(s.policyPath)
		if readErr == nil {
			if err := json.Unmarshal(data, &value); err != nil {
				return fmt.Errorf("解析注册风控设置: %w", err)
			}
		} else if !os.IsNotExist(readErr) {
			return fmt.Errorf("读取注册风控设置: %w", readErr)
		}
	}
	if value == nil {
		s.policy = DefaultRegistrationRiskPolicy()
		return nil
	}
	var policy RegistrationRiskPolicy
	if err := remarshalJSON(value, &policy); err != nil {
		return fmt.Errorf("解析注册风控设置: %w", err)
	}
	policy, err = normalizeRegistrationRiskPolicy(policy)
	if err != nil {
		return fmt.Errorf("注册风控设置无效: %w", err)
	}
	s.policy = policy
	return nil
}

func (s *RegistrationQuotaService) persistPolicyLocked() error {
	if s.store != nil {
		if err := s.store.SaveJSONDocument(registrationRiskPolicyDocumentName, s.policy); err != nil {
			return err
		}
		_ = s.writePolicyFileLocked()
		return nil
	}
	return s.writePolicyFileLocked()
}

func (s *RegistrationQuotaService) writePolicyFileLocked() error {
	data, err := json.Marshal(s.policy)
	if err != nil {
		return err
	}
	return storage.AtomicWriteFile(s.policyPath, append(data, '\n'), 0o600)
}
