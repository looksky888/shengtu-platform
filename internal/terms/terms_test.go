package terms

import "testing"

func TestVersionNonEmpty(t *testing.T) {
	if Version == "" {
		t.Fatal("terms.Version must not be empty")
	}
	if Title == "" {
		t.Fatal("terms.Title must not be empty")
	}
}
