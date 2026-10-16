package service

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

type Logger struct {
	levels func() []string
	logger *slog.Logger
	file   *os.File
}

func NewLogger(dataDir string, levels func() []string) (*Logger, error) {
	path := filepath.Join(dataDir, "logs", "server.log")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	writer := io.MultiWriter(os.Stdout, file)
	return &Logger{
		levels: levels,
		logger: slog.New(slog.NewJSONHandler(writer, nil)),
		file:   file,
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
	if l == nil || l.file == nil {
		return nil
	}
	return l.file.Close()
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
	if s, ok := value.(string); ok && base64LogKey(key) {
		return maskBase64(s)
	}
	return SanitizeLogValue(value)
}

func sensitiveLogKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	switch lower {
	case "authorization", "password", "secret", "token", "tokens", "access_token", "access_tokens", "refresh_token", "refresh_tokens", "api_key", "key", "dx":
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
			strings.HasPrefix(lower, "tokens_")
	}
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

func maskString(value string, keep int) string {
	if len(value) <= keep {
		return value
	}
	return value[:keep] + "..."
}

func maskBase64(value string) string {
	if idx := strings.Index(value, ","); strings.HasPrefix(value, "data:") && idx >= 0 {
		return value[:idx+1] + maskString(value[idx+1:], 24)
	}
	return maskString(value, 24)
}
