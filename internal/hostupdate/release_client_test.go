package hostupdate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const (
	testReleaseVersion = "4.5-test"
	testReleaseCommit  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	testReleaseDigest  = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	testGitHubToken    = "test-read-only-token-0123456789abcdef"
)

func TestReleaseClientResolvesPrivateManifest(t *testing.T) {
	manifest := testReleaseManifest(testReleaseVersion, 1, 1, testReleaseDigest)
	var requests atomic.Int32
	server := newReleaseFixture(t, manifest, false, &requests)
	client := newReleaseClient(Options{
		Repository: "looksky888/shengtu-platform", GitHubToken: testGitHubToken,
		GitHubAPIBase: server.URL, Platform: "linux/amd64",
		ExpectedImage: "ghcr.io/looksky888/shengtu-platform",
	}, server.Client())
	target, err := client.resolve(context.Background(), testReleaseVersion)
	if err != nil {
		t.Fatalf("resolve() error = %v", err)
	}
	if target.Version != testReleaseVersion || target.Digest != testReleaseDigest || target.StorageSchemaVersion != 1 {
		t.Fatalf("resolve() = %#v", target)
	}
	if requests.Load() != 2 {
		t.Fatalf("GitHub request count = %d, want 2", requests.Load())
	}
}

func TestReleaseClientRejectsInvalidDigest(t *testing.T) {
	manifest := testReleaseManifest(testReleaseVersion, 1, 1, "latest")
	server := newReleaseFixture(t, manifest, false, nil)
	client := newReleaseClient(Options{
		Repository: "looksky888/shengtu-platform", GitHubToken: testGitHubToken,
		GitHubAPIBase: server.URL, Platform: "linux/amd64",
		ExpectedImage: "ghcr.io/looksky888/shengtu-platform",
	}, server.Client())
	if _, err := client.resolve(context.Background(), testReleaseVersion); err == nil || !strings.Contains(err.Error(), "digest") {
		t.Fatalf("resolve() error = %v", err)
	}
}

func TestReleaseManifestRejectsIdentityMismatch(t *testing.T) {
	var base releaseManifest
	if err := json.Unmarshal([]byte(testReleaseManifest(testReleaseVersion, 1, 1, testReleaseDigest)), &base); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name   string
		mutate func(*releaseManifest)
		want   string
	}{
		{"version", func(m *releaseManifest) { m.Version = "9.9.9" }, "版本"},
		{"platform", func(m *releaseManifest) { m.Platform = "darwin/amd64" }, "平台"},
		{"image", func(m *releaseManifest) { m.Images.App.Reference = "ghcr.io/example/other" }, "镜像引用"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			manifest := base
			test.mutate(&manifest)
			_, err := manifest.validate(testReleaseVersion, "linux/amd64", "ghcr.io/looksky888/shengtu-platform")
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validate() error = %v", err)
			}
		})
	}
}

func TestValidateStorageUpgradeRejectsSkippedAndDowngradeSchemas(t *testing.T) {
	target := ReleaseTarget{StorageSchemaVersion: 3, MinSourceSchemaVersion: 2}
	if err := validateStorageUpgrade(1, target); err == nil || !strings.Contains(err.Error(), "最低来源版本") {
		t.Fatalf("validateStorageUpgrade(old) error = %v", err)
	}
	if err := validateStorageUpgrade(4, target); err == nil || !strings.Contains(err.Error(), "禁止向下覆盖") {
		t.Fatalf("validateStorageUpgrade(newer) error = %v", err)
	}
	if err := validateStorageUpgrade(2, target); err != nil {
		t.Fatalf("validateStorageUpgrade(compatible) error = %v", err)
	}
}

func newReleaseFixture(t *testing.T, manifest string, prerelease bool, requests *atomic.Int32) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests != nil {
			requests.Add(1)
		}
		if r.Header.Get("Authorization") != "Bearer "+testGitHubToken {
			t.Errorf("authorization = %q", r.Header.Get("Authorization"))
		}
		switch r.URL.Path {
		case "/repos/looksky888/shengtu-platform/releases/tags/v" + testReleaseVersion:
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprintf(w, `{"tag_name":"v%s","draft":false,"prerelease":%t,"assets":[{"id":7,"name":"update-manifest.json","size":%d}]}`, testReleaseVersion, prerelease, len(manifest))
		case "/repos/looksky888/shengtu-platform/releases/assets/7":
			if r.Header.Get("Accept") != "application/octet-stream" {
				t.Errorf("asset Accept = %q", r.Header.Get("Accept"))
			}
			_, _ = w.Write([]byte(manifest))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func testReleaseManifest(version string, schemaVersion, minSource int, digest string) string {
	return fmt.Sprintf(`{
  "schemaVersion": 1,
  "version": %q,
  "channel": "stable",
  "commit": %q,
  "platform": "linux/amd64",
  "images": {"app": {"reference": "ghcr.io/looksky888/shengtu-platform", "digest": %q}},
  "storage": {"schemaVersion": %d, "minSourceSchemaVersion": %d}
}`, version, testReleaseCommit, digest, schemaVersion, minSource)
}

func testManagerOptions(root, readinessURL, githubURL string) Options {
	return Options{
		StateDir: filepath.Join(root, "state"), InstallDir: root,
		ComposeFiles: []string{"docker-compose.yml"}, BackupDir: filepath.Join(root, "backups"),
		ReadinessURL: readinessURL, Repository: "looksky888/shengtu-platform",
		GitHubToken: testGitHubToken, GitHubAPIBase: githubURL,
		Platform: "linux/amd64", ExpectedImage: "ghcr.io/looksky888/shengtu-platform",
		MinimumFree: 1, CommandTimeout: time.Second,
	}
}
