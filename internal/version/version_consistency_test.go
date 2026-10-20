package version

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestReleaseVersionHasSingleSourceOfTruth pins the version drift that keeps
// coming back: VERSION.txt, the Go default, the Dockerfile ARG default, the
// compose image tag and web/package.json must all describe the same release.
// A stale Go default made source builds report an older version, call
// themselves out of date, and offer to replace their own binary.
func TestReleaseVersionHasSingleSourceOfTruth(t *testing.T) {
	release := strings.TrimSpace(repoFileForVersionTest(t, "VERSION.txt"))
	if release == "" {
		t.Fatal("VERSION.txt is empty")
	}
	if Version != release {
		t.Fatalf("version.Version = %q, VERSION.txt = %q; keep them in sync", Version, release)
	}

	dockerfile := repoFileForVersionTest(t, "Dockerfile")
	args := regexp.MustCompile(`(?m)^ARG VERSION=(\S+)\s*$`).FindAllStringSubmatch(dockerfile, -1)
	if len(args) == 0 {
		t.Fatal("Dockerfile declares no ARG VERSION default")
	}
	for _, match := range args {
		if match[1] != release {
			t.Fatalf("Dockerfile ARG VERSION=%s, VERSION.txt = %s", match[1], release)
		}
	}

	if compose := repoFileForVersionTest(t, "docker-compose.yml"); !strings.Contains(compose, release) {
		t.Fatalf("docker-compose.yml does not reference release version %s", release)
	}

	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal([]byte(repoFileForVersionTest(t, filepath.Join("web", "package.json"))), &pkg); err != nil {
		t.Fatalf("parse web/package.json: %v", err)
	}
	if want := releaseVersionCore(release); !strings.HasPrefix(pkg.Version, want+".") {
		t.Fatalf("web/package.json version = %q, want the %s.x line used by VERSION.txt (%q)", pkg.Version, want, release)
	}
}

func releaseVersionCore(release string) string {
	core := strings.TrimPrefix(strings.TrimSpace(release), "v")
	if idx := strings.IndexAny(core, "-+"); idx >= 0 {
		core = core[:idx]
	}
	return core
}

// repoFileForVersionTest reads a repository file; this package sits two levels
// below the repository root.
func repoFileForVersionTest(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return string(data)
}
