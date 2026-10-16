package service

import (
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestPromptFavoriteServiceUpsertListAndDelete(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	service := NewPromptFavoriteService(root, backend)

	item, err := service.Upsert("user_1", map[string]any{
		"prompt_id":            "prompt-a",
		"source":               "manual",
		"title":                "Prompt A",
		"preview":              "https://example.test/a.png",
		"reference_image_urls": []any{"https://example.test/ref.png", "https://example.test/ref.png"},
		"prompt":               "draw a cat",
		"author":               "Alice",
		"mode":                 "edit",
		"category":             "Animals",
		"source_label":         "manual",
		"is_nsfw":              false,
		"localizations": map[string]any{
			"zh-CN": map[string]any{
				"title":        "提示词 A",
				"prompt":       "画一只猫",
				"category":     "动物",
				"sub_category": "猫",
			},
			"fr": map[string]any{
				"title":    "ignored",
				"prompt":   "ignored",
				"category": "ignored",
			},
		},
	})
	if err != nil {
		t.Fatalf("Upsert() error = %v", err)
	}
	if item["id"] == "" || item["mode"] != "edit" || item["favorited_at"] == "" {
		t.Fatalf("created favorite = %#v", item)
	}
	if refs := item["reference_image_urls"].([]string); len(refs) != 1 {
		t.Fatalf("reference urls were not normalized: %#v", item["reference_image_urls"])
	}
	if localizations := item["localizations"].(map[string]any); len(localizations) != 1 {
		t.Fatalf("localizations were not normalized: %#v", item["localizations"])
	}

	items := service.List("user_1")
	if len(items) != 1 || items[0]["title"] != "Prompt A" {
		t.Fatalf("List() = %#v", items)
	}
	if otherItems := service.List("user_2"); len(otherItems) != 0 {
		t.Fatalf("other owner saw favorites: %#v", otherItems)
	}

	updated, err := service.Upsert("user_1", map[string]any{
		"prompt_id":    "prompt-a",
		"source":       "manual",
		"title":        "Prompt A Updated",
		"preview":      "https://example.test/a2.png",
		"prompt":       "draw a dog",
		"author":       "Alice",
		"mode":         "generate",
		"category":     "Animals",
		"source_label": "manual",
	})
	if err != nil {
		t.Fatalf("second Upsert() error = %v", err)
	}
	if updated["id"] != item["id"] || updated["favorited_at"] != item["favorited_at"] {
		t.Fatalf("duplicate upsert changed identity fields: first=%#v second=%#v", item, updated)
	}
	items = service.List("user_1")
	if len(items) != 1 || items[0]["title"] != "Prompt A Updated" {
		t.Fatalf("duplicate upsert did not update in place: %#v", items)
	}

	if ok, err := service.Delete("user_1", item["id"].(string)); err != nil || !ok {
		t.Fatalf("Delete() = %v, %v", ok, err)
	}
	if items = service.List("user_1"); len(items) != 0 {
		t.Fatalf("favorite remained after delete: %#v", items)
	}
	if ok, err := service.Delete("user_1", item["id"].(string)); err != nil || ok {
		t.Fatalf("Delete() missing = %v, %v; want false,nil", ok, err)
	}
}

func TestPromptFavoriteServiceRejectsInvalidInput(t *testing.T) {
	root := t.TempDir()
	service := NewPromptFavoriteService(root, storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json")))

	cases := []map[string]any{
		{"source": "manual", "title": "Title", "preview": "https://example.test/a.png", "prompt": "draw", "author": "Alice"},
		{"prompt_id": "p1", "source": "unknown", "title": "Title", "preview": "https://example.test/a.png", "prompt": "draw", "author": "Alice"},
		{"prompt_id": "p1", "source": "manual", "preview": "https://example.test/a.png", "prompt": "draw", "author": "Alice"},
		{"prompt_id": "p1", "source": "manual", "title": "Title", "prompt": "draw", "author": "Alice"},
		{"prompt_id": "p1", "source": "manual", "title": "Title", "preview": "https://example.test/a.png", "author": "Alice"},
	}
	for index, body := range cases {
		if _, err := service.Upsert("user_1", body); err == nil {
			t.Fatalf("case %d Upsert() error = nil", index)
		}
	}
}
func TestPromptFavoriteServiceUpsertMatchesDedupeKeyWhenPromptIDChanges(t *testing.T) {
	root := t.TempDir()
	service := NewPromptFavoriteService(root, storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json")))

	first, err := service.Upsert("system:prompt-favorites", map[string]any{
		"prompt_id":    "old-generated-id",
		"source":       "manual",
		"title":        "Stable title",
		"preview":      "https://example.test/old-generated-id.png",
		"prompt":       "old prompt",
		"author":       "Manual",
		"mode":         "generate",
		"category":     "Demo",
		"source_label": "manual",
	})
	if err != nil {
		t.Fatalf("first Upsert() error = %v", err)
	}

	updated, err := service.Upsert("system:prompt-favorites", map[string]any{
		"prompt_id":    "new-stable-id",
		"source":       "manual",
		"title":        "Stable title",
		"preview":      "https://example.test/new-stable-id.png",
		"prompt":       "new prompt",
		"author":       "Manual",
		"mode":         "generate",
		"category":     "Demo",
		"source_label": "manual",
		"dedupe_key":   promptFavoriteDedupeKey(*normalizeStoredPromptFavorite(first)),
	})
	if err != nil {
		t.Fatalf("second Upsert() error = %v", err)
	}
	items := service.List("system:prompt-favorites")
	if len(items) != 1 {
		t.Fatalf("dedupe key upsert should update in place, got %#v", items)
	}
	if updated["prompt_id"] != "new-stable-id" || items[0]["prompt"] != "new prompt" {
		t.Fatalf("favorite was not updated with latest remote body: updated=%#v items=%#v", updated, items)
	}
}
