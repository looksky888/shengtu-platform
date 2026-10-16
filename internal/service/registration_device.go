package service

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func loadOrCreateDeviceSecret(dataDir, explicit string) ([]byte, error) {
	if s := strings.TrimSpace(explicit); s != "" {
		return []byte(s), nil
	}
	if s := strings.TrimSpace(os.Getenv("CHATGPT2API_DEVICE_ID_SECRET")); s != "" {
		return []byte(s), nil
	}
	dataDir = strings.TrimSpace(dataDir)
	if dataDir == "" {
		return nil, fmt.Errorf("设备 Secret 数据目录为空")
	}
	path := filepath.Join(dataDir, "device_id.secret")
	if data, err := os.ReadFile(path); err == nil {
		if v := strings.TrimSpace(string(data)); v != "" {
			return []byte(v), nil
		}
		return nil, fmt.Errorf("设备 Secret 文件为空: %s", path)
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("读取设备 Secret 失败: %w", err)
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return nil, fmt.Errorf("生成设备 Secret 失败: %w", err)
	}
	secret := hex.EncodeToString(buf)
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建设备 Secret 目录失败: %w", err)
	}
	if err := os.WriteFile(path, []byte(secret+"\n"), 0o600); err != nil {
		return nil, fmt.Errorf("保存设备 Secret 失败: %w", err)
	}
	return []byte(secret), nil
}

// loadPreviousDeviceSecrets returns verify-only secrets (env/config), excluding current.
func loadPreviousDeviceSecrets(explicit string, current []byte) [][]byte {
	raw := strings.TrimSpace(explicit)
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("CHATGPT2API_DEVICE_ID_SECRET_PREVIOUS"))
	}
	if raw == "" {
		return nil
	}
	// Support comma-separated list for multi-step rotations.
	parts := strings.Split(raw, ",")
	out := make([][]byte, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		prev := []byte(p)
		if hmac.Equal(prev, current) {
			continue
		}
		out = append(out, prev)
	}
	return out
}

// NormalizeClientIP canonicalizes an IP for quota keys.
// IPv6 uses /64 prefix so rotating interface IDs cannot bypass caps easily.
func NormalizeClientIP(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	raw = strings.Trim(raw, "[]")
	ip := net.ParseIP(raw)
	if ip == nil {
		return raw
	}
	if v4 := ip.To4(); v4 != nil {
		return v4.String()
	}
	ip16 := ip.To16()
	if ip16 == nil {
		return raw
	}
	prefix := make(net.IP, 16)
	copy(prefix, ip16)
	for i := 8; i < 16; i++ {
		prefix[i] = 0
	}
	return prefix.String() + "/64"
}

// SignDeviceID returns cookie value: id.base64url(hmac) using the current secret.
func (s *RegistrationQuotaService) SignDeviceID(id string) string {
	if s == nil {
		return ""
	}
	return signDeviceIDWithSecret(id, s.secret)
}

func signDeviceIDWithSecret(id string, secret []byte) string {
	id = strings.TrimSpace(id)
	if id == "" || len(secret) == 0 {
		return ""
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(id))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return id + "." + sig
}

// VerifyDeviceToken validates cookie/body device token and returns bare id.
// Accepts signatures from the current secret or previous rotation secrets.
func (s *RegistrationQuotaService) VerifyDeviceToken(token string) (string, bool) {
	id, ok, _ := s.VerifyDeviceTokenDetailed(token)
	return id, ok
}

// VerifyDeviceTokenDetailed is like VerifyDeviceToken but reports whether the
// token was signed with the current secret (false ⇒ should re-issue cookie).
func (s *RegistrationQuotaService) VerifyDeviceTokenDetailed(token string) (id string, ok bool, current bool) {
	token = strings.TrimSpace(token)
	if token == "" || s == nil {
		return "", false, false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", false, false
	}
	id = parts[0]
	wantCurrent := signDeviceIDWithSecret(id, s.secret)
	if wantCurrent != "" && hmac.Equal([]byte(wantCurrent), []byte(token)) {
		return id, true, true
	}
	for _, prev := range s.previousSecrets {
		wantPrev := signDeviceIDWithSecret(id, prev)
		if wantPrev != "" && hmac.Equal([]byte(wantPrev), []byte(token)) {
			return id, true, false
		}
	}
	return "", false, false
}

// DeviceTokenNeedsRefresh reports that token is valid under a previous secret only.
func (s *RegistrationQuotaService) DeviceTokenNeedsRefresh(token string) bool {
	_, ok, current := s.VerifyDeviceTokenDetailed(token)
	return ok && !current
}

// IssueDeviceID creates a new random device id.
func IssueDeviceID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		sum := sha256.Sum256([]byte(fmt.Sprintf("%d", time.Now().UnixNano())))
		return hex.EncodeToString(sum[:16])
	}
	return hex.EncodeToString(buf)
}

// DeviceCookieName is the browser cookie used for device binding.
func DeviceCookieName() string { return deviceCookieName }
