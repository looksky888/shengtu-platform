package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreReadsUpdateGitHubTokenFromEnvFile(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("CHATGPT2API_UPDATE_GITHUB_TOKEN=ghp_test_token\n"), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_UPDATE_GITHUB_TOKEN")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if got := store.UpdateGitHubToken(); got != "ghp_test_token" {
		t.Fatalf("UpdateGitHubToken() = %q, want token from .env", got)
	}
	if _, ok := store.Get()["update_github_token"]; ok {
		t.Fatal("Get() leaked update GitHub token")
	}
	if got := store.Get()["update_github_token_configured"]; got != true {
		t.Fatalf("Get() update_github_token_configured = %#v, want true", got)
	}
}

func TestStoreUpdatePersistsUpdateSettings(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_UPDATE_GITHUB_TOKEN")
	unsetEnv(t, "CHATGPT2API_UPDATE_REPO")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	got, err := store.Update(map[string]any{
		"update_repo":         "owner/project",
		"update_github_token": "github_pat_test",
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if got["update_repo"] != "owner/project" {
		t.Fatalf("Update() update_repo = %#v, want owner/project", got["update_repo"])
	}
	if got["update_github_token_configured"] != true {
		t.Fatalf("Update() update_github_token_configured = %#v, want true", got["update_github_token_configured"])
	}
	if _, ok := got["update_github_token"]; ok {
		t.Fatalf("Update() leaked update_github_token: %#v", got)
	}
	if store.UpdateRepo() != "owner/project" {
		t.Fatalf("UpdateRepo() = %q, want owner/project", store.UpdateRepo())
	}
	if store.UpdateGitHubToken() != "github_pat_test" {
		t.Fatalf("UpdateGitHubToken() = %q, want saved token", store.UpdateGitHubToken())
	}
	envData, err := os.ReadFile(filepath.Join(root, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	envText := string(envData)
	for _, want := range []string{
		"CHATGPT2API_UPDATE_REPO=owner/project",
		"CHATGPT2API_UPDATE_GITHUB_TOKEN=github_pat_test",
	} {
		if !strings.Contains(envText, want) {
			t.Fatalf(".env missing %q:\n%s", want, envText)
		}
	}
}

func TestStoreUpdateRejectsInvalidUpdateRepo(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_UPDATE_REPO")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if _, err := store.Update(map[string]any{"update_repo": "invalid"}); err == nil {
		t.Fatal("Update() accepted invalid update_repo")
	}
}

func TestStoreUpdateImageCreditCostsAcceptsJSONNumbers(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	unsetEnv(t, "CHATGPT2API_IMAGE_CREDIT_COST_1080P")
	unsetEnv(t, "CHATGPT2API_IMAGE_CREDIT_COST_2K")
	unsetEnv(t, "CHATGPT2API_IMAGE_CREDIT_COST_4K")
	unsetEnv(t, "CHATGPT2API_GPT_IMAGE_2_CREDIT_COST")
	unsetEnv(t, "CHATGPT2API_GPT_IMAGE_2_5_CREDIT_COST")
	unsetEnv(t, "CHATGPT2API_GPT_IMAGE_2_5_FLARE_CREDIT_COST")
	unsetEnv(t, "CHATGPT2API_GPT_IMAGE_2_5_SUNBURST_CREDIT_COST")
	unsetEnv(t, "CHATGPT2API_GROK_IMAGE_CREDIT_COST_1K")
	unsetEnv(t, "CHATGPT2API_GROK_IMAGE_CREDIT_COST_2K")
	unsetEnv(t, "CHATGPT2API_VIDEO_CREDIT_COST_PER_SECOND")

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	got, err := store.Update(map[string]any{
		"image_credit_cost_1080p":            float64(2),
		"image_credit_cost_2k":               float64(5),
		"image_credit_cost_4k":               float64(9),
		"gpt_image_2_credit_cost":            float64(11),
		"gpt_image_2_5_credit_cost":          float64(12),
		"gpt_image_2_5_flare_credit_cost":    float64(13),
		"gpt_image_2_5_sunburst_credit_cost": float64(14),
		"grok_image_credit_cost_1k":          float64(3),
		"grok_image_credit_cost_2k":          float64(7),
		"video_credit_cost_per_second":       float64(4),
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if got["image_credit_cost_1080p"] != 2 || got["image_credit_cost_2k"] != 5 || got["image_credit_cost_4k"] != 9 {
		t.Fatalf("image credit costs = %#v", got)
	}
	if got["grok_image_credit_cost_1k"] != 3 || got["grok_image_credit_cost_2k"] != 7 || got["video_credit_cost_per_second"] != 4 {
		t.Fatalf("grok/video credit costs = %#v", got)
	}
	if got["gpt_image_2_credit_cost"] != 11 || got["gpt_image_2_5_credit_cost"] != 12 || got["gpt_image_2_5_flare_credit_cost"] != 13 || got["gpt_image_2_5_sunburst_credit_cost"] != 14 {
		t.Fatalf("gpt model credit costs = %#v", got)
	}
	if store.GrokImageCreditCost1K() != 3 || store.GrokImageCreditCost2K() != 7 || store.VideoCreditCostPerSecond() != 4 {
		t.Fatalf("grok/video store costs = %d/%d/%d", store.GrokImageCreditCost1K(), store.GrokImageCreditCost2K(), store.VideoCreditCostPerSecond())
	}
	if store.ImageCreditCost1080P() != 2 || store.ImageCreditCost2K() != 5 || store.ImageCreditCost4K() != 9 {
		t.Fatalf("store costs = %d/%d/%d", store.ImageCreditCost1080P(), store.ImageCreditCost2K(), store.ImageCreditCost4K())
	}
	if store.GPTImage2CreditCost() != 11 || store.GPTImage25CreditCost() != 12 || store.GPTImage25FlareCreditCost() != 13 || store.GPTImage25SunburstCreditCost() != 14 {
		t.Fatalf("gpt model store costs = %d/%d/%d/%d", store.GPTImage2CreditCost(), store.GPTImage25CreditCost(), store.GPTImage25FlareCreditCost(), store.GPTImage25SunburstCreditCost())
	}
}

func TestStoreEnvFileManagedSettingOverridesStaleProcessEnv(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_IMAGE_CREDIT_COST_1080P", "1")
	unsetEnv(t, "CHATGPT2API_IMAGE_CREDIT_COST_2K")
	unsetEnv(t, "CHATGPT2API_IMAGE_CREDIT_COST_4K")
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("CHATGPT2API_IMAGE_CREDIT_COST_1080P=2\n"), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if got := store.ImageCreditCost1080P(); got != 2 {
		t.Fatalf("ImageCreditCost1080P() = %d, want .env value 2", got)
	}
	if got := os.Getenv("CHATGPT2API_IMAGE_CREDIT_COST_1080P"); got != "2" {
		t.Fatalf("process env after NewStore = %q, want 2", got)
	}

	updated, err := store.Update(map[string]any{"image_credit_cost_1080p": 4})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated["image_credit_cost_1080p"] != 4 || store.ImageCreditCost1080P() != 4 {
		t.Fatalf("updated cost = %#v store=%d, want 4", updated["image_credit_cost_1080p"], store.ImageCreditCost1080P())
	}
	if got := os.Getenv("CHATGPT2API_IMAGE_CREDIT_COST_1080P"); got != "4" {
		t.Fatalf("process env after Update = %q, want 4", got)
	}
	envData, err := os.ReadFile(filepath.Join(root, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	if !strings.Contains(string(envData), "CHATGPT2API_IMAGE_CREDIT_COST_1080P=4") {
		t.Fatalf(".env was not updated with latest cost:\n%s", string(envData))
	}
}
