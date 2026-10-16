package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreUpdatePersistsRuntimeSettings(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_BASE_URL")
	unsetEnv(t, "CHATGPT2API_PROXY")
	unsetEnv(t, "CHATGPT2API_REFRESH_ACCOUNT_INTERVAL_MINUTE")
	unsetEnv(t, "CHATGPT2API_IMAGE_CONCURRENT_LIMIT")
	unsetEnv(t, "CHATGPT2API_IMAGE_TASK_TIMEOUT_SECONDS")
	unsetEnv(t, "CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT")
	unsetEnv(t, "CHATGPT2API_USER_DEFAULT_RPM_LIMIT")
	unsetEnv(t, "CHATGPT2API_IMAGE_RETENTION_DAYS")
	unsetEnv(t, "CHATGPT2API_LOG_RETENTION_DAYS")
	unsetEnv(t, "CHATGPT2API_AUTO_REMOVE_INVALID_ACCOUNTS")
	unsetEnv(t, "CHATGPT2API_AUTO_REMOVE_RATE_LIMITED_ACCOUNTS")
	unsetEnv(t, "CHATGPT2API_REGISTRATION_ENABLED")
	unsetEnv(t, "CHATGPT2API_LOG_LEVELS")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	got, err := store.Update(map[string]any{
		"base_url":                        "https://example.test/root/",
		"proxy":                           "http://127.0.0.1:8080",
		"refresh_account_interval_minute": 7,
		"image_concurrent_limit":          3,
		"image_task_timeout_seconds":      420,
		"user_default_concurrent_limit":   2,
		"user_default_rpm_limit":          30,
		"image_retention_days":            14,
		"log_retention_days":              21,
		"registration_enabled":            true,
		"log_levels":                      []any{"debug", "error"},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if store.BaseURL() != "https://example.test/root" {
		t.Fatalf("BaseURL() = %q", store.BaseURL())
	}
	assertConfigValue(t, got, "registration_enabled", true)

	envData, err := os.ReadFile(filepath.Join(root, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	envText := string(envData)
	for _, want := range []string{
		"CHATGPT2API_BASE_URL=https://example.test/root/",
		"CHATGPT2API_PROXY=http://127.0.0.1:8080",
		"CHATGPT2API_REFRESH_ACCOUNT_INTERVAL_MINUTE=7",
		"CHATGPT2API_IMAGE_CONCURRENT_LIMIT=3",
		"CHATGPT2API_IMAGE_TASK_TIMEOUT_SECONDS=420",
		"CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT=2",
		"CHATGPT2API_USER_DEFAULT_RPM_LIMIT=30",
		"CHATGPT2API_IMAGE_RETENTION_DAYS=14",
		"CHATGPT2API_LOG_RETENTION_DAYS=21",
		"CHATGPT2API_REGISTRATION_ENABLED=true",
		"CHATGPT2API_LOG_LEVELS=debug,error",
	} {
		if !strings.Contains(envText, want) {
			t.Fatalf(".env missing %q in:\n%s", want, envText)
		}
	}
}

func TestStoreNormalizesUnsupportedLoginPageImageMode(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_LOGIN_PAGE_IMAGE_MODE")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	got, err := store.Update(map[string]any{"login_page_image_mode": "repeat"})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	assertConfigValue(t, got, "login_page_image_mode", "contain")
	if store.LoginPageImageMode() != "contain" {
		t.Fatalf("LoginPageImageMode() = %q, want contain", store.LoginPageImageMode())
	}
	envData, err := os.ReadFile(filepath.Join(root, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	envText := string(envData)
	if strings.Contains(envText, "CHATGPT2API_LOGIN_PAGE_IMAGE_MODE=repeat") {
		t.Fatalf(".env persisted unsupported login page image mode:\n%s", envText)
	}
	if !strings.Contains(envText, "CHATGPT2API_LOGIN_PAGE_IMAGE_MODE=contain") {
		t.Fatalf(".env missing normalized login page image mode:\n%s", envText)
	}
}

func TestStoreNormalizesImageTaskTimeoutSeconds(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_IMAGE_TASK_TIMEOUT_SECONDS")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	got, err := store.Update(map[string]any{"image_task_timeout_seconds": 5})
	if err != nil {
		t.Fatalf("Update() min error = %v", err)
	}
	assertConfigValue(t, got, "image_task_timeout_seconds", 30)
	if store.ImageTaskTimeoutSeconds() != 30 {
		t.Fatalf("ImageTaskTimeoutSeconds() = %d, want 30", store.ImageTaskTimeoutSeconds())
	}

	got, err = store.Update(map[string]any{"image_task_timeout_seconds": 7200})
	if err != nil {
		t.Fatalf("Update() max error = %v", err)
	}
	assertConfigValue(t, got, "image_task_timeout_seconds", 3600)
	if store.ImageTaskTimeoutSeconds() != 3600 {
		t.Fatalf("ImageTaskTimeoutSeconds() = %d, want 3600", store.ImageTaskTimeoutSeconds())
	}
}

func TestStoreUpdateRefreshesEnvFileBackedRuntimeSettings(t *testing.T) {
	root := t.TempDir()
	envText := strings.Join([]string{
		"CHATGPT2API_BASE_URL=https://old.example/root",
		"CHATGPT2API_PROXY=http://127.0.0.1:8080",
		"CHATGPT2API_REFRESH_ACCOUNT_INTERVAL_MINUTE=5",
		"CHATGPT2API_IMAGE_CONCURRENT_LIMIT=4",
		"CHATGPT2API_IMAGE_TASK_TIMEOUT_SECONDS=300",
		"CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT=2",
		"CHATGPT2API_USER_DEFAULT_RPM_LIMIT=30",
		"CHATGPT2API_IMAGE_RETENTION_DAYS=30",
		"CHATGPT2API_LOG_RETENTION_DAYS=7",
		"CHATGPT2API_AUTO_REMOVE_INVALID_ACCOUNTS=true",
		"CHATGPT2API_AUTO_REMOVE_RATE_LIMITED_ACCOUNTS=false",
		"CHATGPT2API_LOG_LEVELS=warning,error",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte(envText), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_BASE_URL", "https://old.example/root")
	t.Setenv("CHATGPT2API_PROXY", "http://127.0.0.1:8080")
	t.Setenv("CHATGPT2API_REFRESH_ACCOUNT_INTERVAL_MINUTE", "5")
	t.Setenv("CHATGPT2API_IMAGE_CONCURRENT_LIMIT", "4")
	t.Setenv("CHATGPT2API_IMAGE_TASK_TIMEOUT_SECONDS", "300")
	t.Setenv("CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT", "2")
	t.Setenv("CHATGPT2API_USER_DEFAULT_RPM_LIMIT", "30")
	t.Setenv("CHATGPT2API_IMAGE_RETENTION_DAYS", "30")
	t.Setenv("CHATGPT2API_LOG_RETENTION_DAYS", "7")
	t.Setenv("CHATGPT2API_AUTO_REMOVE_INVALID_ACCOUNTS", "true")
	t.Setenv("CHATGPT2API_AUTO_REMOVE_RATE_LIMITED_ACCOUNTS", "false")
	t.Setenv("CHATGPT2API_LOG_LEVELS", "warning,error")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	got, err := store.Update(map[string]any{
		"base_url":                          "https://new.example/root/",
		"proxy":                             "http://127.0.0.1:9090",
		"refresh_account_interval_minute":   9,
		"image_concurrent_limit":            6,
		"image_task_timeout_seconds":        480,
		"user_default_concurrent_limit":     3,
		"user_default_rpm_limit":            45,
		"image_retention_days":              12,
		"log_retention_days":                30,
		"auto_remove_invalid_accounts":      false,
		"auto_remove_rate_limited_accounts": true,
		"log_levels":                        []any{"debug", "info"},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	assertConfigValue(t, got, "base_url", "https://new.example/root")
	assertConfigValue(t, got, "proxy", "http://127.0.0.1:9090")
	assertConfigValue(t, got, "refresh_account_interval_minute", 9)
	assertConfigValue(t, got, "image_concurrent_limit", 6)
	assertConfigValue(t, got, "image_task_timeout_seconds", 480)
	assertConfigValue(t, got, "user_default_concurrent_limit", 3)
	assertConfigValue(t, got, "user_default_rpm_limit", 45)
	assertConfigValue(t, got, "image_retention_days", 12)
	assertConfigValue(t, got, "log_retention_days", 30)
	assertConfigValue(t, got, "auto_remove_invalid_accounts", false)
	assertConfigValue(t, got, "auto_remove_rate_limited_accounts", true)
	if levels := strings.Join(store.LogLevels(), ","); levels != "debug,info" {
		t.Fatalf("LogLevels() = %q, want debug,info", levels)
	}

	for key, want := range map[string]string{
		"CHATGPT2API_BASE_URL":                          "https://new.example/root/",
		"CHATGPT2API_PROXY":                             "http://127.0.0.1:9090",
		"CHATGPT2API_REFRESH_ACCOUNT_INTERVAL_MINUTE":   "9",
		"CHATGPT2API_IMAGE_CONCURRENT_LIMIT":            "6",
		"CHATGPT2API_IMAGE_TASK_TIMEOUT_SECONDS":        "480",
		"CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT":     "3",
		"CHATGPT2API_USER_DEFAULT_RPM_LIMIT":            "45",
		"CHATGPT2API_IMAGE_RETENTION_DAYS":              "12",
		"CHATGPT2API_LOG_RETENTION_DAYS":                "30",
		"CHATGPT2API_AUTO_REMOVE_INVALID_ACCOUNTS":      "false",
		"CHATGPT2API_AUTO_REMOVE_RATE_LIMITED_ACCOUNTS": "true",
		"CHATGPT2API_LOG_LEVELS":                        "debug,info",
	} {
		if gotEnv := os.Getenv(key); gotEnv != want {
			t.Fatalf("%s = %q, want %q", key, gotEnv, want)
		}
	}
}

func TestStoreEnvFileManagedSettingOverridesDifferentProcessEnv(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte(strings.Join([]string{
		"CHATGPT2API_BASE_URL=https://file.example",
		"",
	}, "\n")), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_BASE_URL", "https://external.example")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if got := store.BaseURL(); got != "https://file.example" {
		t.Fatalf("BaseURL() = %q, want .env managed value", got)
	}
	got, err := store.Update(map[string]any{"base_url": "https://saved.example"})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	assertConfigValue(t, got, "base_url", "https://saved.example")
	if gotEnv := os.Getenv("CHATGPT2API_BASE_URL"); gotEnv != "https://saved.example" {
		t.Fatalf("CHATGPT2API_BASE_URL = %q, want saved .env value", gotEnv)
	}
}

func TestStoreKeepsExternalEnvironmentOverrideWhenEnvFileDoesNotManageSetting(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_BASE_URL", "https://external.example")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if got := store.BaseURL(); got != "https://external.example" {
		t.Fatalf("BaseURL() = %q, want external override", got)
	}
	got, err := store.Update(map[string]any{"base_url": "https://saved.example"})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	assertConfigValue(t, got, "base_url", "https://external.example")
	if gotEnv := os.Getenv("CHATGPT2API_BASE_URL"); gotEnv != "https://external.example" {
		t.Fatalf("CHATGPT2API_BASE_URL = %q, want external override unchanged", gotEnv)
	}
}

func TestNewStoreDiscoversEnvFromParentDirectory(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("CHATGPT2API_BASE_URL=https://parent.example\n"), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}
	nested := filepath.Join(root, "cmd", "chatgpt2api")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("mkdir nested: %v", err)
	}
	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}
	if err := os.Chdir(nested); err != nil {
		t.Fatalf("Chdir() error = %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(originalWD)
	})
	unsetEnv(t, "CHATGPT2API_ROOT")
	unsetEnv(t, "CHATGPT2API_BASE_URL")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if store.RootDir != root {
		t.Fatalf("RootDir = %q, want %q", store.RootDir, root)
	}
	if store.BaseURL() != "https://parent.example" {
		t.Fatalf("BaseURL() = %q", store.BaseURL())
	}
}
