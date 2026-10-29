package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreUpdateProxyAPIAllowsExternalAPIKey(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_IMAGE_PROXY_API_KEY", "env-proxy-key")
	unsetEnv(t, "CHATGPT2API_IMAGE_PROVIDER")
	unsetEnv(t, "CHATGPT2API_IMAGE_PROXY_BASE_URL")
	unsetEnv(t, "CHATGPT2API_IMAGE_PROXY_MODEL")
	unsetEnv(t, "CHATGPT2API_IMAGE_PROXY_MODELS")
	unsetEnv(t, "CHATGPT2API_IMAGE_PROXY_TIMEOUT_SECONDS")
	unsetEnv(t, "CHATGPT2API_IMAGE_PROXY_MAX_RETRIES")
	unsetEnv(t, "CHATGPT2API_IMAGE_PROXY_DOWNLOAD_URLS")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	got, err := store.Update(map[string]any{
		"image_provider":            "proxy_api",
		"image_proxy_base_url":      "https://proxy.example",
		"image_proxy_model":         "gpt-image-2",
		"image_proxy_download_urls": false,
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if got["image_proxy_api_key_configured"] != true {
		t.Fatalf("image_proxy_api_key_configured = %#v, want true", got["image_proxy_api_key_configured"])
	}
	if _, ok := got["image_proxy_api_key"]; ok {
		t.Fatalf("Update() leaked image_proxy_api_key: %#v", got)
	}
	if got["image_proxy_download_urls"] != false || store.ImageProxyDownloadURLs() {
		t.Fatalf("image_proxy_download_urls = %#v store=%v, want false", got["image_proxy_download_urls"], store.ImageProxyDownloadURLs())
	}
}

func assertConfigValue(t *testing.T, data map[string]any, key string, want any) {
	t.Helper()
	if got := data[key]; got != want {
		t.Fatalf("%s = %#v, want %#v", key, got, want)
	}
}

func unsetEnv(t *testing.T, key string) {
	t.Helper()
	original, existed := os.LookupEnv(key)
	if err := os.Unsetenv(key); err != nil {
		t.Fatalf("Unsetenv(%s): %v", key, err)
	}
	t.Cleanup(func() {
		if existed {
			_ = os.Setenv(key, original)
		} else {
			_ = os.Unsetenv(key)
		}
	})
}

func TestStoreNormalizesImageModelRoutingSettings(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_IMAGE_DEFAULT_MODEL")
	unsetEnv(t, "CHATGPT2API_IMAGE_INTERNAL_MODEL_SLUG")
	unsetEnv(t, "CHATGPT2API_IMAGE_FALLBACK_MODEL_ENABLED")
	unsetEnv(t, "CHATGPT2API_IMAGE_FALLBACK_MODEL_SLUGS")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	got, err := store.Update(map[string]any{
		"image_default_model":          "unknown",
		"image_internal_model_slug":    "gpt-5-3",
		"image_fallback_model_enabled": false,
		"image_fallback_model_slugs":   []any{"gpt-5-3", "bad", "gpt-5.5", "gpt-5.5"},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if store.ImageDefaultModel() != "gpt-image-2.5-flare" {
		t.Fatalf("ImageDefaultModel() = %q, want gpt-image-2.5-flare", store.ImageDefaultModel())
	}
	if store.ImageInternalModelSlug() != "gpt-5-3" {
		t.Fatalf("ImageInternalModelSlug() = %q, want gpt-5-3", store.ImageInternalModelSlug())
	}
	if store.ImageFallbackModelEnabled() {
		t.Fatal("ImageFallbackModelEnabled() = true, want false")
	}
	wantFallback := []string{"gpt-5-3", "gpt-5.5"}
	if strings.Join(store.ImageFallbackModelSlugs(), ",") != strings.Join(wantFallback, ",") {
		t.Fatalf("ImageFallbackModelSlugs() = %#v, want %#v", store.ImageFallbackModelSlugs(), wantFallback)
	}
	assertConfigValue(t, got, "image_default_model", "gpt-image-2.5-flare")
	assertConfigValue(t, got, "image_internal_model_slug", "gpt-5-3")

	for _, allowed := range []string{"gpt-image-2", "gpt-image-2.5", "gpt-image-2.5-sunburst", "auto"} {
		updated, err := store.Update(map[string]any{"image_default_model": allowed})
		if err != nil {
			t.Fatalf("Update(image_default_model=%s) error = %v", allowed, err)
		}
		if store.ImageDefaultModel() != allowed || updated["image_default_model"] != allowed {
			t.Fatalf("image_default_model = %q / %#v, want %q", store.ImageDefaultModel(), updated["image_default_model"], allowed)
		}
	}
}

func TestImageProviderSourceDefault(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_IMAGE_PROVIDER")
	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if got := store.ImageProviderSource(); got != "default" {
		t.Fatalf("ImageProviderSource() = %q, want default", got)
	}
}

func TestImageProviderSourceEnvFile(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_IMAGE_PROVIDER")
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("CHATGPT2API_IMAGE_PROVIDER=proxy_api\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if got := store.ImageProviderSource(); got != "env_file" {
		t.Fatalf("ImageProviderSource() = %q, want env_file", got)
	}
}

func TestImageProviderSourceEnvironment(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_IMAGE_PROVIDER", "proxy_api")
	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if got := store.ImageProviderSource(); got != "environment" {
		t.Fatalf("ImageProviderSource() = %q, want environment", got)
	}
}

func TestImageProviderSourceRuntimeEnvironment(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_IMAGE_PROVIDER")
	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if err := os.Setenv("CHATGPT2API_IMAGE_PROVIDER", "proxy_api"); err != nil {
		t.Fatalf("Setenv() error = %v", err)
	}
	if got := store.ImageProviderSource(); got != "runtime_environment" {
		t.Fatalf("ImageProviderSource() = %q, want runtime_environment", got)
	}
}
