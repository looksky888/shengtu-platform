package config

import "testing"

func TestCanvasURLValidation(t *testing.T) {
	for _, value := range []any{"javascript:alert(1)", "//host.test", "/canvas", "http://", "https://a:b@host.test", "https://host.test/\\evil", "https://host.test/a b", nil, 123} {
		if err := normalizeCanvasUpdate(map[string]any{"canvas_url": value}); err == nil {
			t.Fatalf("accepted invalid URL: %v", value)
		}
	}
}

func TestCanvasURLPersistenceAndClear(t *testing.T) {
	t.Setenv("CHATGPT2API_ROOT", t.TempDir())
	unsetEnv(t, "CHATGPT2API_CANVAS_URL")
	s, err := NewStore()
	if err != nil {
		t.Fatal(err)
	}
	if s.CanvasURL() != "" {
		t.Fatal("canvas should default to hidden")
	}
	for _, value := range []string{"http://70.39.183.38:3000/", "https://canvas.example.com/app?view=1#board", ""} {
		got, err := s.Update(map[string]any{"canvas_url": " " + value + " "})
		if err != nil {
			t.Fatal(err)
		}
		if got["canvas_url"] != value {
			t.Fatalf("unexpected value: %v", got["canvas_url"])
		}
		reloaded, err := NewStore()
		if err != nil {
			t.Fatal(err)
		}
		if reloaded.CanvasURL() != value {
			t.Fatalf("persistence failed: %q", reloaded.CanvasURL())
		}
	}
}
