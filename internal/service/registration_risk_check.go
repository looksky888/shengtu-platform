package service

import (
	"fmt"
	"net"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

const (
	riskBlockDevice = "device"
	riskBlockIP     = "ip"
	riskBlockPair   = "ip_device"
)

type RegistrationRiskError struct {
	Code       string
	Message    string
	RetryAfter time.Duration
}

func (e *RegistrationRiskError) Error() string { return e.Message }

func (s *RegistrationQuotaService) checkRiskLocked(input RegistrationRiskInput, now time.Time, mutate bool) error {
	if !s.policy.Enabled {
		return nil
	}
	if blocked := s.activeBlockLocked(riskBlockPair, riskPairKey(input.ClientIP, input.DeviceID), now); blocked != nil {
		return riskBlockError(blocked, now)
	}
	if blocked := s.activeBlockLocked(riskBlockDevice, input.DeviceID, now); blocked != nil {
		return riskBlockError(blocked, now)
	}
	if blocked := s.activeBlockLocked(riskBlockIP, input.ClientIP, now); blocked != nil {
		return riskBlockError(blocked, now)
	}

	deviceCutoff := s.riskUnblockCutoffLocked(riskBlockDevice, input.DeviceID, now.AddDate(0, 0, -s.policy.DeviceWindowDays))
	deviceCount := s.successCountLocked(deviceCutoff, func(event RegistrationQuotaEvent) bool {
		return input.DeviceID != "" && event.DeviceID == input.DeviceID
	})
	if deviceCount >= s.policy.DeviceSuccessLimit {
		return s.denyWithBlockLocked(riskBlockDevice, input.DeviceID, "device_limit", "此设备注册账号过多，已临时封禁", time.Duration(s.policy.DeviceBlockHours)*time.Hour, now, mutate)
	}
	devicePending := s.pendingCountLocked(deviceCutoff, func(event RegistrationQuotaEvent) bool {
		return input.DeviceID != "" && event.DeviceID == input.DeviceID
	})
	if deviceCount+devicePending >= s.policy.DeviceSuccessLimit {
		return &RegistrationRiskError{Code: "device_capacity_pending", Message: "此设备有注册请求处理中，请稍后再试", RetryAfter: staleReserveTTL}
	}

	ipCutoff := s.riskUnblockCutoffLocked(riskBlockIP, input.ClientIP, now.Add(-time.Duration(s.policy.IPWindowHours)*time.Hour))
	ipCount, pendingIPCount := 0, 0
	successDevices, activeDevices := map[string]struct{}{}, map[string]struct{}{}
	for _, event := range s.state.Events {
		if !quotaEventInWindow(event, ipCutoff) || input.ClientIP == "" || NormalizeClientIP(event.ClientIP) != input.ClientIP {
			continue
		}
		if successfulRegistrationEvent(event) {
			ipCount++
			if event.DeviceID != "" {
				successDevices[event.DeviceID] = struct{}{}
				activeDevices[event.DeviceID] = struct{}{}
			}
		} else if pendingRegistrationEvent(event) {
			pendingIPCount++
			if event.DeviceID != "" {
				activeDevices[event.DeviceID] = struct{}{}
			}
		}
	}
	if ipCount >= s.policy.IPSuccessLimit && len(successDevices) >= s.policy.IPDistinctDeviceLimit {
		return s.denyWithBlockLocked(riskBlockIP, input.ClientIP, "ip_device_cluster", "此 IP 注册设备和账号过多，已临时封禁", time.Duration(s.policy.IPBlockHours)*time.Hour, now, mutate)
	}
	if ipCount+pendingIPCount >= s.policy.IPSuccessLimit && len(activeDevices) >= s.policy.IPDistinctDeviceLimit {
		return &RegistrationRiskError{Code: "ip_capacity_pending", Message: "此 IP 有多个注册请求处理中，请稍后再试", RetryAfter: staleReserveTTL}
	}

	if subnet := IPv4Subnet24(input.ClientIP); subnet != "" {
		cutoff := now.Add(-time.Duration(s.policy.SubnetWindowHours) * time.Hour)
		count := s.successCountLocked(cutoff, func(event RegistrationQuotaEvent) bool {
			return IPv4Subnet24(event.ClientIP) == subnet
		})
		if count >= s.policy.SubnetSuccessLimit {
			return &RegistrationRiskError{Code: "subnet_limit", Message: "当前网段注册账号过多，请稍后再试", RetryAfter: time.Duration(s.policy.SubnetWindowHours) * time.Hour}
		}
		pending := s.pendingCountLocked(cutoff, func(event RegistrationQuotaEvent) bool {
			return IPv4Subnet24(event.ClientIP) == subnet
		})
		if count+pending >= s.policy.SubnetSuccessLimit {
			return &RegistrationRiskError{Code: "subnet_capacity_pending", Message: "当前网段有较多注册请求处理中，请稍后再试", RetryAfter: staleReserveTTL}
		}
	}
	return nil
}

func (s *RegistrationQuotaService) recordAttemptAndCheckLocked(input RegistrationRiskInput, now time.Time) error {
	attempt := RegistrationAttempt{
		ID: util.NewHex(12), ClientIP: input.ClientIP, DeviceID: input.DeviceID,
		Email: input.Email, CreatedAt: now.UTC().Format(time.RFC3339Nano),
	}
	s.state.Attempts = append(s.state.Attempts, attempt)
	pairCutoff := s.riskUnblockCutoffLocked(riskBlockPair, riskPairKey(input.ClientIP, input.DeviceID), now.Add(-time.Duration(s.policy.PairAttemptWindowMinutes)*time.Minute))
	pairCount := 0
	for _, item := range s.state.Attempts {
		if parseRegistrationQuotaTime(item.CreatedAt).After(pairCutoff) && item.ClientIP == input.ClientIP && item.DeviceID == input.DeviceID {
			pairCount++
		}
	}
	if input.ClientIP != "" && input.DeviceID != "" && pairCount >= s.policy.PairAttemptLimit {
		return s.denyWithBlockLocked(riskBlockPair, riskPairKey(input.ClientIP, input.DeviceID), "pair_attempts", "注册尝试过于频繁，当前网络与设备已进入冷却", time.Duration(s.policy.PairCooldownHours)*time.Hour, now, true)
	}
	if isDisposableEmail(input.Email, s.policy.DisposableDomains) && s.isProxyIPLocked(input.ClientIP) && s.deviceSeenLocked(input.DeviceID) {
		return &RegistrationRiskError{Code: "compound_risk", Message: "当前邮箱或网络环境风险过高，已拒绝注册"}
	}
	return nil
}

func (s *RegistrationQuotaService) denyWithBlockLocked(kind, key, code, message string, duration time.Duration, now time.Time, mutate bool) error {
	if key == "" {
		return &RegistrationRiskError{Code: code, Message: message, RetryAfter: duration}
	}
	if block := s.activeBlockLocked(kind, key, now); block != nil {
		return riskBlockError(block, now)
	}
	if mutate {
		s.state.Blocks = append(s.state.Blocks, RegistrationRiskBlock{
			ID: "block_" + util.NewHex(10), Kind: kind, Key: key, Code: code, Reason: message,
			CreatedAt: now.UTC().Format(time.RFC3339Nano), ExpiresAt: now.Add(duration).UTC().Format(time.RFC3339Nano),
		})
	}
	return &RegistrationRiskError{Code: code, Message: message, RetryAfter: duration}
}

func (s *RegistrationQuotaService) activeBlockLocked(kind, key string, now time.Time) *RegistrationRiskBlock {
	if key == "" {
		return nil
	}
	for index := len(s.state.Blocks) - 1; index >= 0; index-- {
		block := &s.state.Blocks[index]
		if block.Kind == kind && block.Key == key && parseRegistrationQuotaTime(block.ExpiresAt).After(now) {
			return block
		}
	}
	return nil
}

func riskBlockError(block *RegistrationRiskBlock, now time.Time) error {
	retry := parseRegistrationQuotaTime(block.ExpiresAt).Sub(now)
	if retry < 0 {
		retry = 0
	}
	return &RegistrationRiskError{Code: block.Code, Message: block.Reason, RetryAfter: retry}
}

func (s *RegistrationQuotaService) successCountLocked(cutoff time.Time, matches func(RegistrationQuotaEvent) bool) int {
	count := 0
	for _, event := range s.state.Events {
		if successfulRegistrationEvent(event) && quotaEventInWindow(event, cutoff) && matches(event) {
			count++
		}
	}
	return count
}

func (s *RegistrationQuotaService) pendingCountLocked(cutoff time.Time, matches func(RegistrationQuotaEvent) bool) int {
	count := 0
	for _, event := range s.state.Events {
		if pendingRegistrationEvent(event) && quotaEventInWindow(event, cutoff) && matches(event) {
			count++
		}
	}
	return count
}

func successfulRegistrationEvent(event RegistrationQuotaEvent) bool {
	return strings.TrimSpace(event.UserID) != ""
}

func pendingRegistrationEvent(event RegistrationQuotaEvent) bool {
	return strings.TrimSpace(event.UserID) == "" && strings.TrimSpace(event.ReserveID) != ""
}

func quotaEventInWindow(event RegistrationQuotaEvent, cutoff time.Time) bool {
	created := parseRegistrationQuotaTime(event.CreatedAt)
	return !created.IsZero() && !created.Before(cutoff)
}

func riskPairKey(ip, deviceID string) string {
	if ip == "" || deviceID == "" {
		return ""
	}
	return ip + "|" + deviceID
}

func IPv4Subnet24(raw string) string {
	ip := net.ParseIP(NormalizeClientIP(raw)).To4()
	if ip == nil {
		return ""
	}
	return fmt.Sprintf("%d.%d.%d.0/24", ip[0], ip[1], ip[2])
}

func isDisposableEmail(email string, domains []string) bool {
	_, domain, ok := strings.Cut(strings.ToLower(strings.TrimSpace(email)), "@")
	if !ok || domain == "" {
		return false
	}
	for _, blocked := range domains {
		if domain == blocked || strings.HasSuffix(domain, "."+blocked) {
			return true
		}
	}
	return false
}

func (s *RegistrationQuotaService) isProxyIPLocked(raw string) bool {
	normalized := NormalizeClientIP(raw)
	if prefix, _, ok := strings.Cut(normalized, "/"); ok {
		normalized = prefix
	}
	ip := net.ParseIP(normalized)
	if ip == nil {
		return false
	}
	for _, rawCIDR := range s.policy.ProxyCIDRs {
		_, network, err := net.ParseCIDR(rawCIDR)
		if err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

func (s *RegistrationQuotaService) deviceSeenLocked(deviceID string) bool {
	if deviceID == "" {
		return false
	}
	for _, event := range s.state.Events {
		if event.DeviceID == deviceID && strings.TrimSpace(event.UserID) != "" {
			return true
		}
	}
	return false
}
