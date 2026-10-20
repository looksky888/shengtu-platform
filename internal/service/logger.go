package service

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Logger struct {
	levels func() []string
	logger *slog.Logger
	closer io.Closer
}

func NewLogger(dataDir string, levels func() []string) (*Logger, error) {
	path := filepath.Join(dataDir, "logs", "server.log")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	// The file rotates on size; it used to be opened for append with no bound at
	// all, which can fill the data volume of a long-running instance.
	rotator, err := newRotatingFileWriter(path, defaultServerLogMaxBytes, defaultServerLogMaxRotatedFile)
	if err != nil {
		return nil, err
	}
	writer := io.MultiWriter(os.Stdout, rotator)
	return &Logger{
		levels: levels,
		logger: slog.New(slog.NewJSONHandler(writer, nil)),
		closer: rotator,
	}, nil
}

func (l *Logger) enabled(level string) bool {
	if l == nil {
		return false
	}
	var levels []string
	if l.levels != nil {
		levels = l.levels()
	}
	if len(levels) == 0 {
		return level == "info" || level == "warning" || level == "error"
	}
	for _, item := range levels {
		if item == level {
			return true
		}
	}
	return false
}

func (l *Logger) Debug(message string, attrs ...any) { l.print("debug", message, attrs...) }

func (l *Logger) Info(message string, attrs ...any) { l.print("info", message, attrs...) }

func (l *Logger) Warning(message string, attrs ...any) { l.print("warning", message, attrs...) }

func (l *Logger) Error(message string, attrs ...any) { l.print("error", message, attrs...) }

func (l *Logger) Close() error {
	if l == nil || l.closer == nil {
		return nil
	}
	return l.closer.Close()
}

func (l *Logger) print(level string, message string, attrs ...any) {
	if !l.enabled(level) {
		return
	}
	if strings.TrimSpace(message) == "" {
		message = level
	}
	l.logger.Log(context.Background(), slogLevel(level), message, sanitizeSlogAttrs(attrs)...)
}

func slogLevel(level string) slog.Level {
	switch level {
	case "debug":
		return slog.LevelDebug
	case "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func sanitizeSlogAttrs(attrs []any) []any {
	out := make([]any, 0, len(attrs))
	for i := 0; i < len(attrs); i++ {
		key, ok := attrs[i].(string)
		if ok && i+1 < len(attrs) {
			out = append(out, key, sanitizeLogField(key, attrs[i+1]))
			i++
			continue
		}
		out = append(out, SanitizeLogValue(attrs[i]))
	}
	return out
}

func SanitizeLogValue(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for key, value := range x {
			out[key] = sanitizeLogField(key, value)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = SanitizeLogValue(item)
		}
		return out
	case []map[string]any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = SanitizeLogValue(item)
		}
		return out
	case error:
		return x.Error()
	case string:
		if strings.HasPrefix(strings.TrimSpace(x), "data:") && strings.Contains(x, ";base64,") {
			return maskBase64(x)
		}
		return x
	default:
		return v
	}
}

func sanitizeLogField(key string, value any) any {
	if sensitiveLogKey(key) {
		return maskSensitiveLogValue(value)
	}
	if emailLogKey(key) {
		return maskEmailLogValue(value)
	}
	if s, ok := value.(string); ok && base64LogKey(key) {
		return maskBase64(s)
	}
	return SanitizeLogValue(value)
}

// maskEmailLogValue masks e-mail addresses in a log field, keeping the domain.
func maskEmailLogValue(value any) any {
	switch x := value.(type) {
	case string:
		return maskEmailString(x)
	case []string:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = maskEmailString(item)
		}
		return out
	default:
		return SanitizeLogValue(value)
	}
}

func maskEmailString(value string) string {
	trimmed := strings.TrimSpace(value)
	at := strings.LastIndex(trimmed, "@")
	if at <= 0 || at == len(trimmed)-1 {
		return maskString(trimmed, 2)
	}
	local := []rune(trimmed[:at])
	return string(local[:1]) + "***" + trimmed[at:]
}

func sensitiveLogKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	switch lower {
	case "authorization", "password", "secret", "token", "tokens", "access_token", "access_tokens", "refresh_token", "refresh_tokens", "api_key", "key", "dx",
		"phone", "mobile", "id_card", "idcard":
		return true
	default:
		return strings.Contains(lower, "password") ||
			strings.Contains(lower, "secret") ||
			strings.Contains(lower, "private_key") ||
			strings.Contains(lower, "api_v3_key") ||
			strings.HasSuffix(lower, "_pem") ||
			strings.Contains(lower, "authorization") ||
			strings.HasSuffix(lower, "_token") ||
			strings.HasSuffix(lower, "_tokens") ||
			strings.HasPrefix(lower, "token_") ||
			strings.HasPrefix(lower, "tokens_") ||
			strings.HasSuffix(lower, "_phone") ||
			strings.HasSuffix(lower, "_mobile")
	}
}

// emailLogKey matches fields that hold an e-mail address. They are masked by
// keeping the domain only, so logs stay diagnosable without storing the account
// identifier (the local part is what identifies a person).
func emailLogKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	switch lower {
	case "email", "mail", "email_address", "mail_address":
		return true
	}
	return strings.HasSuffix(lower, "_email") || strings.HasSuffix(lower, "_mail")
}

func base64LogKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	return lower == "b64_json" || strings.Contains(lower, "base64")
}

func maskSensitiveLogValue(value any) any {
	switch x := value.(type) {
	case nil:
		return nil
	case string:
		return maskString(x, 10)
	case []string:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = maskSensitiveLogValue(item)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = maskSensitiveLogValue(item)
		}
		return out
	case []map[string]any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = maskSensitiveLogValue(item)
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for key, item := range x {
			out[key] = maskSensitiveLogValue(item)
		}
		return out
	default:
		return "[redacted]"
	}
}

// maskString renders a secret for logs. Long values keep the historical
// prefix + "..." form so operators can still tell two credentials apart, but a
// value shorter than minSecretRevealLength is masked completely: the old code
// returned anything <= keep characters verbatim, which leaked short passwords
// and tokens into the log store in clear text.
func maskString(value string, keep int) string {
	const minSecretRevealLength = 16
	runes := []rune(value)
	if len(runes) == 0 {
		return ""
	}
	if len(runes) < minSecretRevealLength {
		return "***(" + strconv.Itoa(len(runes)) + ")"
	}
	if keep < 1 {
		keep = 1
	}
	if keep > len(runes) {
		keep = len(runes)
	}
	return string(runes[:keep]) + "..."
}

func maskBase64(value string) string {
	if idx := strings.Index(value, ","); strings.HasPrefix(value, "data:") && idx >= 0 {
		return value[:idx+1] + maskString(value[idx+1:], 24)
	}
	return maskString(value, 24)
}
