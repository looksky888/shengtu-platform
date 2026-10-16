package app

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	updateCacheTTL         = 10 * time.Minute
	updateHTTPTimeout      = 45 * time.Second
	updateDownloadMaxBytes = 256 << 20
)

var updateGitHubAPIBaseURL = "https://api.github.com"

type publicUpdateStatus struct {
	Enabled         bool              `json:"enabled"`
	Current         publicVersionInfo `json:"current"`
	LatestVersion   string            `json:"latest_version,omitempty"`
	LatestName      string            `json:"latest_name,omitempty"`
	LatestNotes     string            `json:"latest_notes,omitempty"`
	PublishedAt     string            `json:"published_at,omitempty"`
	AssetName       string            `json:"asset_name,omitempty"`
	AssetAvailable  bool              `json:"asset_available"`
	UpdateAvailable bool              `json:"update_available"`
	CheckedAt       string            `json:"checked_at,omitempty"`
	Error           string            `json:"error,omitempty"`
}

type updateCandidate struct {
	Status      publicUpdateStatus
	DownloadURL string
	SHA256      string
}

type updateManifest struct {
	Version     string                `json:"version"`
	Name        string                `json:"name"`
	Notes       string                `json:"notes"`
	PublishedAt string                `json:"published_at"`
	Assets      []updateManifestAsset `json:"assets"`
}

type updateManifestAsset struct {
	Name   string `json:"name"`
	OS     string `json:"os"`
	Arch   string `json:"arch"`
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type httpStatusError struct {
	StatusCode int
	Body       string
}

func (e *httpStatusError) Error() string {
	if strings.TrimSpace(e.Body) == "" {
		return fmt.Sprintf("HTTP %d", e.StatusCode)
	}
	return fmt.Sprintf("HTTP %d：%s", e.StatusCode, strings.TrimSpace(e.Body))
}

func (s *Server) handleUpdateStatus(w http.ResponseWriter, r *http.Request) {
	status := s.updateStatus(r.Context(), r.URL.Query().Get("force") == "1")
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"update":  status,
	})
}

func (s *Server) handleApplyUpdate(w http.ResponseWriter, r *http.Request) {
	if !s.isAdminRequest(r) {
		writeError(w, http.StatusForbidden, errCode("admin_required", "需要管理员权限", false))
		return
	}
	result, err := s.applyUpdate(r.Context())
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"update":  result,
	})
}
