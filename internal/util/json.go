package util

import (
	"bytes"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func Clean(v any) string {
	return strings.TrimSpace(fmt.Sprint(ValueOr(v, "")))
}

func ValueOr(v any, fallback any) any {
	if v == nil {
		return fallback
	}
	return v
}

func StringMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func CopyMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func AsStringSlice(v any) []string {
	switch x := v.(type) {
	case []string:
		return x
	case []any:
		out := make([]string, 0, len(x))
		for _, item := range x {
			if s := Clean(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func AsMapSlice(v any) []map[string]any {
	switch x := v.(type) {
	case []map[string]any:
		return x
	case []any:
		out := make([]map[string]any, 0, len(x))
		for _, item := range x {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	default:
		return nil
	}
}

func ToInt(v any, fallback int) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case json.Number:
		n, err := x.Int64()
		if err == nil {
			return int(n)
		}
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(x))
		if err == nil {
			return n
		}
	}
	return fallback
}

func ToBool(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		switch strings.ToLower(strings.TrimSpace(x)) {
		case "1", "true", "yes", "on":
			return true
		}
		return false
	case json.Number:
		// Decoders using UseNumber (http_helpers, DecodeJSON) hand numbers to us as
		// json.Number, whose dynamic type is not string. Without this case a JSON
		// `0` fell through to "present, therefore true" and switched flags ON.
		number, err := x.Float64()
		if err != nil {
			return false
		}
		return number != 0
	case float64:
		return x != 0
	case float32:
		return x != 0
	case int:
		return x != 0
	case int8:
		return x != 0
	case int16:
		return x != 0
	case int32:
		return x != 0
	case int64:
		return x != 0
	case uint:
		return x != 0
	case uint8:
		return x != 0
	case uint16:
		return x != 0
	case uint32:
		return x != 0
	case uint64:
		return x != 0
	default:
		// Fail closed: an unexpected shape under a boolean key must not switch the
		// setting on. Callers that need a default pass one in explicitly.
		return false
	}
}

func DecodeJSON(r io.Reader, out any) error {
	dec := json.NewDecoder(r)
	dec.UseNumber()
	return dec.Decode(out)
}

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
}

type APIError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
}

type APIErrorDetail struct {
	Error APIError `json:"error"`
}

type APIErrorResponse struct {
	Detail APIErrorDetail `json:"detail"`
}

func ErrorPayload(message string) APIErrorDetail {
	return APIErrorDetail{Error: APIError{Message: message}}
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, APIErrorResponse{Detail: ErrorPayload(message)})
}

func WriteCodedError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, APIErrorResponse{Detail: APIErrorDetail{Error: APIError{Code: code, Message: message}}})
}

func NewUUID() string {
	b := MustRandomBytes(16)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func NewHex(n int) string {
	if n <= 0 {
		n = 16
	}
	buf := MustRandomBytes((n + 1) / 2)
	return hex.EncodeToString(buf)[:n]
}

func SHA256Hex(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

func SHA1Short(text string, n int) string {
	sum := sha1.Sum([]byte(text))
	hexed := hex.EncodeToString(sum[:])
	if n > 0 && n < len(hexed) {
		return hexed[:n]
	}
	return hexed
}

func RandomTokenURL(n int) string {
	if n <= 0 {
		n = 24
	}
	return base64.RawURLEncoding.EncodeToString(MustRandomBytes(n))
}

func MustRandomBytes(n int) []byte {
	if n < 0 {
		panic("random byte count cannot be negative")
	}
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		panic(fmt.Errorf("crypto/rand failed: %w", err))
	}
	return buf
}

func B64Encode(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

func B64Decode(text string) ([]byte, error) {
	if idx := strings.Index(text, ","); strings.HasPrefix(text, "data:") && idx >= 0 {
		text = text[idx+1:]
	}
	return base64.StdEncoding.DecodeString(strings.TrimSpace(text))
}

func CompactJSON(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, data); err != nil {
		return string(data)
	}
	return buf.String()
}

// chinaLocation is the product business timezone (中国时间).
// Prefer IANA Asia/Shanghai; fall back to fixed +08:00 when zone data is missing.
// Product policy: all user-facing and business timestamps use this zone only.
var chinaLocation = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	return loc
}()

// ChinaLocation returns the shared Asia/Shanghai location.
func ChinaLocation() *time.Location {
	return chinaLocation
}

// NowChina returns time.Now() in Asia/Shanghai.
func NowChina() time.Time {
	return time.Now().In(chinaLocation)
}

// NowLocal returns the current time as China wall-clock "YYYY-MM-DD HH:mm:ss".
// Independent of host/OS timezone so US servers still emit 中国时间.
func NowLocal() string {
	return NowChina().Format("2006-01-02 15:04:05")
}

// NowISO returns the current China time as RFC3339 (with +08:00 offset).
// Name kept for call-site compatibility; value is 中国时间, not UTC.
func NowISO() string {
	return NowChina().Format(time.RFC3339Nano)
}

// ChinaDate returns the current calendar day in Asia/Shanghai as "YYYY-MM-DD".
func ChinaDate() string {
	return NowChina().Format("2006-01-02")
}

// ChinaDatePath returns year/month/day path segments in Asia/Shanghai.
func ChinaDatePath() (year, month, day string) {
	now := NowChina()
	return now.Format("2006"), now.Format("01"), now.Format("02")
}

func AnonymizeToken(token any) string {
	value := Clean(token)
	if value == "" {
		return "token:empty"
	}
	return "token:" + SHA256Hex(value)[:10]
}

func ParseCommaList(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if item := strings.TrimSpace(part); item != "" {
			out = append(out, item)
		}
	}
	return out
}
