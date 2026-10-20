package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type githubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	Body        string        `json:"body"`
	PublishedAt time.Time     `json:"published_at"`
	HTMLURL     string        `json:"html_url"`
	Assets      []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

func (s *UpdateService) fetchLatestRelease(ctx context.Context) (*UpdateInfo, error) {
	apiURL := s.apiBaseURL + "/repos/" + strings.Trim(s.repo, "/") + "/releases/latest"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "chatgpt2api-updater")
	if s.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.githubToken)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, githubAPIStatusError(resp, s.repo)
	}
	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	latestVersion := strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
	assets := make([]Asset, 0, len(release.Assets))
	for _, asset := range release.Assets {
		assets = append(assets, Asset{
			Name:        asset.Name,
			DownloadURL: asset.BrowserDownloadURL,
			Size:        asset.Size,
		})
	}
	return &UpdateInfo{
		CurrentVersion: s.currentVersion,
		LatestVersion:  latestVersion,
		HasUpdate:      compareVersions(s.currentVersion, latestVersion) < 0,
		ReleaseInfo: &ReleaseInfo{
			Name:        release.Name,
			Body:        release.Body,
			PublishedAt: release.PublishedAt,
			HTMLURL:     release.HTMLURL,
			Assets:      assets,
		},
		Cached:    false,
		BuildType: s.buildType,
	}, nil
}

func githubAPIStatusError(resp *http.Response, repo string) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	message := githubErrorMessage(body)
	parts := []string{fmt.Sprintf("GitHub API returned %d", resp.StatusCode)}
	if message != "" {
		parts = append(parts, message)
	}
	if resp.StatusCode == http.StatusNotFound {
		parts = append(parts, fmt.Sprintf("latest GitHub Release was not found for %s; publish a GitHub Release with release archives, configure CHATGPT2API_UPDATE_REPO to the repository that contains releases, or ensure the GitHub token can read the repository", repo))
	}
	if resp.StatusCode == http.StatusForbidden && strings.TrimSpace(resp.Header.Get("X-RateLimit-Remaining")) == "0" {
		hint := "GitHub API rate limit exhausted"
		if reset := githubRateLimitReset(resp.Header.Get("X-RateLimit-Reset")); reset != "" {
			hint += "; reset at " + reset
		}
		hint += "; set CHATGPT2API_UPDATE_GITHUB_TOKEN to use authenticated GitHub API requests"
		parts = append(parts, hint)
	}
	return errors.New(strings.Join(parts, ": "))
}

func githubErrorMessage(body []byte) string {
	var payload struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		return strings.TrimSpace(payload.Message)
	}
	return strings.TrimSpace(string(body))
}

func githubRateLimitReset(value string) string {
	seconds, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || seconds <= 0 {
		return ""
	}
	return time.Unix(seconds, 0).Format(time.RFC3339)
}
