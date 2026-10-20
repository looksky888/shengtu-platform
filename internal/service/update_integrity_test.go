package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
)

func TestMatchingReleaseAssetsRecognizesChecksumManifests(t *testing.T) {
	archiveName := runtime.GOOS + "_" + runtime.GOARCH
	archive := "chatgpt2api_1.2.3_" + archiveName + ".tar.gz"

	for _, manifest := range []string{"checksums.txt", "sha256sums.txt", "SHA256SUMS.txt", "my-checksums.txt"} {
		assets := []Asset{
			{Name: archive, DownloadURL: "https://github.com/o/r/releases/download/v1.2.3/" + archive},
			{Name: manifest, DownloadURL: "https://github.com/o/r/releases/download/v1.2.3/" + manifest},
		}
		downloadURL, checksumURL := matchingReleaseAssets(assets, archiveName)
		if !strings.HasSuffix(downloadURL, archive) {
			t.Fatalf("manifest %q: downloadURL = %q, want the %s archive", manifest, downloadURL, archiveName)
		}
		if !strings.HasSuffix(checksumURL, manifest) {
			t.Fatalf("manifest %q: checksumURL = %q, want the manifest itself", manifest, checksumURL)
		}
	}
}

func TestMatchingReleaseAssetsIgnoresNonChecksumText(t *testing.T) {
	archiveName := runtime.GOOS + "_" + runtime.GOARCH
	archive := "chatgpt2api_1.2.3_" + archiveName + ".tar.gz"
	assets := []Asset{
		{Name: archive, DownloadURL: "https://github.com/o/r/releases/download/v1.2.3/" + archive},
		{Name: "release-notes.txt", DownloadURL: "https://github.com/o/r/releases/download/v1.2.3/release-notes.txt"},
	}
	downloadURL, checksumURL := matchingReleaseAssets(assets, archiveName)
	if !strings.HasSuffix(downloadURL, archive) {
		t.Fatalf("downloadURL = %q, want the archive", downloadURL)
	}
	if checksumURL != "" {
		t.Fatalf("checksumURL = %q, want empty when the release publishes no checksum manifest", checksumURL)
	}
}

// TestPerformUpdateRefusesReleaseWithoutChecksumManifest pins the integrity gate:
// an unsigned release that publishes no checksum manifest must not be installed,
// because replacing the running binary without any verification is unrecoverable.
func TestPerformUpdateRefusesReleaseWithoutChecksumManifest(t *testing.T) {
	archiveName := runtime.GOOS + "_" + runtime.GOARCH
	archive := "chatgpt2api_1.2.3_" + archiveName + ".tar.gz"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"tag_name": "v1.2.3",
			"name": "v1.2.3",
			"body": "release notes",
			"html_url": "https://github.com/ZyphrZero/chatgpt2api/releases/tag/v1.2.3",
			"published_at": "2026-01-01T00:00:00Z",
			"assets": [
				{"name": "` + archive + `", "browser_download_url": "https://github.com/ZyphrZero/chatgpt2api/releases/download/v1.2.3/` + archive + `"}
			]
		}`))
	}))
	defer api.Close()

	service := NewUpdateService(UpdateOptions{
		Repo:           "ZyphrZero/chatgpt2api",
		APIBaseURL:     api.URL,
		CurrentVersion: "1.1.0",
		BuildType:      "release",
	})
	err := service.PerformUpdate(context.Background())
	if err == nil {
		t.Fatal("PerformUpdate() succeeded, want refusal when no checksum manifest is published")
	}
	if !strings.Contains(err.Error(), "checksums.txt") || !strings.Contains(err.Error(), "sha256sums") {
		t.Fatalf("error %q should name the missing checksum manifest", err.Error())
	}
}
