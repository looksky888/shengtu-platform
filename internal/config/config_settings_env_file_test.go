package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreUsesDedicatedSettingsEnvFile(t *testing.T) {
	root := t.TempDir()
	baseEnv := filepath.Join(root, ".env")
	settingsEnv := filepath.Join(root, "data", "settings.env")
	const baseContent = "INTERNAL_SERVICE_TOKEN=base-secret\n"
	if err := os.WriteFile(baseEnv, []byte(baseContent), 0o600); err != nil {
		t.Fatalf("write base env: %v", err)
	}
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv(settingsEnvFileKey, settingsEnv)
	t.Setenv("CHATGPT2API_IMAGE_CONCURRENT_LIMIT", "3")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if store.EnvFile != settingsEnv {
		t.Fatalf("EnvFile = %q, want %q", store.EnvFile, settingsEnv)
	}
	if got := store.ImageConcurrentLimit(); got != 3 {
		t.Fatalf("initial concurrent limit = %d, want process env value 3", got)
	}
	if _, err := store.Update(map[string]any{"image_concurrent_limit": 7}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if _, err := store.Update(map[string]any{"image_worker_count": 12, "image_queue_capacity": 400}); err != nil {
		t.Fatalf("Update(worker settings) error = %v", err)
	}
	if store.ImageWorkerCount() != 12 || store.ImageQueueCapacity() != 400 {
		t.Fatalf("worker settings = %d/%d, want 12/400", store.ImageWorkerCount(), store.ImageQueueCapacity())
	}
	if got := store.ImageConcurrentLimit(); got != 7 {
		t.Fatalf("updated concurrent limit = %d, want 7", got)
	}
	baseAfter, err := os.ReadFile(baseEnv)
	if err != nil {
		t.Fatalf("read base env: %v", err)
	}
	if string(baseAfter) != baseContent {
		t.Fatalf("base env changed:\n%s", baseAfter)
	}
	settingsAfter, err := os.ReadFile(settingsEnv)
	if err != nil {
		t.Fatalf("read settings env: %v", err)
	}
	if !strings.Contains(string(settingsAfter), "CHATGPT2API_IMAGE_CONCURRENT_LIMIT=7") {
		t.Fatalf("dedicated settings missing update:\n%s", settingsAfter)
	}
	if !strings.Contains(string(settingsAfter), "CHATGPT2API_IMAGE_WORKER_COUNT=12") ||
		!strings.Contains(string(settingsAfter), "CHATGPT2API_IMAGE_QUEUE_CAPACITY=400") {
		t.Fatalf("dedicated settings missing worker controls:\n%s", settingsAfter)
	}

	reloaded, err := NewStore()
	if err != nil {
		t.Fatalf("reload NewStore() error = %v", err)
	}
	if got := reloaded.ImageConcurrentLimit(); got != 7 {
		t.Fatalf("reloaded concurrent limit = %d, want 7", got)
	}
	if reloaded.ImageWorkerCount() != 12 || reloaded.ImageQueueCapacity() != 400 {
		t.Fatalf("reloaded worker settings = %d/%d, want 12/400", reloaded.ImageWorkerCount(), reloaded.ImageQueueCapacity())
	}
}
