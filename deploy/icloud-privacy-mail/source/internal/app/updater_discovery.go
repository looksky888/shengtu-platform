package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"runtime"
	"strings"
	"time"
)

func (s *Server) updateStatus(ctx context.Context, force bool) publicUpdateStatus {
	candidate, err := s.latestUpdateCandidate(ctx, force)
	if err != nil {
		status := publicUpdateStatus{
			Enabled:   s.cfg.UpdateEnabled,
			Current:   currentVersionInfo(),
			CheckedAt: formatTime(time.Now()),
			Error:     err.Error(),
		}
		return status
	}
	return candidate.Status
}

func (s *Server) latestUpdateCandidate(ctx context.Context, force bool) (updateCandidate, error) {
	now := time.Now()
	s.updateMu.Lock()
	if !force && !s.updateCacheAt.IsZero() && now.Sub(s.updateCacheAt) < updateCacheTTL {
		cached := s.updateCache
		s.updateMu.Unlock()
		return cached, nil
	}
	s.updateMu.Unlock()

	candidate, err := s.fetchLatestUpdateCandidate(ctx, now)
	if err != nil {
		return updateCandidate{}, err
	}

	s.updateMu.Lock()
	s.updateCache = candidate
	s.updateCacheAt = now
	s.updateMu.Unlock()
	return candidate, nil
}

func (s *Server) fetchLatestUpdateCandidate(ctx context.Context, checkedAt time.Time) (updateCandidate, error) {
	status := publicUpdateStatus{
		Enabled:   s.cfg.UpdateEnabled,
		Current:   currentVersionInfo(),
		CheckedAt: formatTime(checkedAt),
	}
	if !s.cfg.UpdateEnabled {
		return updateCandidate{Status: status}, nil
	}
	if manifestURL := strings.TrimSpace(s.cfg.UpdateManifestURL); manifestURL != "" {
		return s.fetchManifestUpdateCandidate(ctx, manifestURL, status)
	}
	if strings.TrimSpace(s.cfg.UpdateRepository) == "" {
		return updateCandidate{Status: status}, nil
	}
	return s.fetchGitHubReleaseUpdateCandidate(ctx, status)
}

func (s *Server) fetchManifestUpdateCandidate(ctx context.Context, manifestURL string, status publicUpdateStatus) (updateCandidate, error) {
	var manifest updateManifest
	if err := getJSON(ctx, manifestURL, &manifest); err != nil {
		return updateCandidate{}, fmt.Errorf("检查更新失败：%w", err)
	}
	asset, ok := selectManifestAsset(manifest.Assets, runtime.GOOS, runtime.GOARCH, s.cfg.UpdateAssetName)
	status.LatestVersion = strings.TrimSpace(manifest.Version)
	status.LatestName = strings.TrimSpace(firstNonEmptyString(manifest.Name, manifest.Version))
	status.LatestNotes = strings.TrimSpace(manifest.Notes)
	status.PublishedAt = strings.TrimSpace(manifest.PublishedAt)
	status.AssetAvailable = ok
	status.UpdateAvailable = versionIsNewer(status.Current.Version, status.LatestVersion)
	if ok {
		status.AssetName = strings.TrimSpace(asset.Name)
	}
	return updateCandidate{
		Status:      status,
		DownloadURL: strings.TrimSpace(asset.URL),
		SHA256:      strings.ToLower(strings.TrimSpace(asset.SHA256)),
	}, nil
}

func (s *Server) fetchGitHubReleaseUpdateCandidate(ctx context.Context, status publicUpdateStatus) (updateCandidate, error) {
	repo := strings.Trim(strings.TrimSpace(s.cfg.UpdateRepository), "/")
	if repo == "" {
		return updateCandidate{}, errors.New("检查更新失败：未配置 update_repository")
	}
	apiURL := githubAPIURL("/repos/" + repo + "/releases/latest")
	var release struct {
		TagName     string               `json:"tag_name"`
		Name        string               `json:"name"`
		Body        string               `json:"body"`
		PublishedAt string               `json:"published_at"`
		Assets      []githubReleaseAsset `json:"assets"`
	}
	if err := getJSON(ctx, apiURL, &release); err != nil {
		var statusErr *httpStatusError
		if errors.As(err, &statusErr) && statusErr.StatusCode == http.StatusNotFound {
			return s.fetchGitHubDefaultBranchUpdateCandidate(ctx, repo, status)
		}
		return updateCandidate{}, fmt.Errorf("检查更新失败：%w", err)
	}
	asset, ok := selectGitHubReleaseAsset(release.Assets, runtime.GOOS, runtime.GOARCH, s.cfg.UpdateAssetName)
	status.LatestVersion = strings.TrimSpace(release.TagName)
	status.LatestName = strings.TrimSpace(firstNonEmptyString(release.Name, release.TagName))
	status.LatestNotes = strings.TrimSpace(release.Body)
	status.PublishedAt = strings.TrimSpace(release.PublishedAt)
	status.AssetAvailable = ok
	status.UpdateAvailable = versionIsNewer(status.Current.Version, status.LatestVersion)
	if ok {
		status.AssetName = strings.TrimSpace(asset.Name)
	}
	return updateCandidate{
		Status:      status,
		DownloadURL: strings.TrimSpace(asset.BrowserDownloadURL),
	}, nil
}

func (s *Server) fetchGitHubDefaultBranchUpdateCandidate(ctx context.Context, repo string, status publicUpdateStatus) (updateCandidate, error) {
	var repoInfo struct {
		DefaultBranch string `json:"default_branch"`
	}
	if err := getJSON(ctx, githubAPIURL("/repos/"+repo), &repoInfo); err != nil {
		return updateCandidate{}, fmt.Errorf("检查更新失败：GitHub 仓库没有 Release，且读取默认分支失败：%w", err)
	}
	branch := strings.TrimSpace(repoInfo.DefaultBranch)
	if branch == "" {
		branch = "master"
	}
	var commitInfo struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message   string `json:"message"`
			Committer struct {
				Date string `json:"date"`
			} `json:"committer"`
		} `json:"commit"`
	}
	if err := getJSON(ctx, githubAPIURL("/repos/"+repo+"/commits/"+url.PathEscape(branch)), &commitInfo); err != nil {
		return updateCandidate{}, fmt.Errorf("检查更新失败：GitHub 仓库没有 Release，且读取最新提交失败：%w", err)
	}
	latestSHA := strings.TrimSpace(commitInfo.SHA)
	shortSHA := shortCommit(latestSHA)
	currentCommit := strings.TrimSpace(status.Current.Commit)
	matchesCurrent := currentCommit != "" && currentCommit != "unknown" && strings.HasPrefix(latestSHA, currentCommit)
	status.LatestName = "GitHub 最新源码 " + shortSHA
	status.LatestVersion = strings.TrimSpace(status.Current.Version)
	if shortSHA != "" {
		if status.LatestVersion == "" {
			status.LatestVersion = shortSHA
		} else {
			status.LatestVersion += " / " + shortSHA
		}
	}
	status.PublishedAt = strings.TrimSpace(commitInfo.Commit.Committer.Date)
	status.AssetAvailable = false
	status.UpdateAvailable = currentCommit != "" && currentCommit != "unknown" && !matchesCurrent
	if matchesCurrent {
		status.LatestNotes = "GitHub 仓库还没有发布 Release 更新包；已按默认分支最新提交确认，当前服务已经是最新源码。"
	} else if currentCommit == "" || currentCommit == "unknown" {
		status.LatestNotes = "GitHub 仓库还没有发布 Release 更新包；当前程序没有写入提交号，无法判断是否为最新源码。"
	} else {
		status.LatestNotes = "GitHub 仓库还没有发布 Release 更新包；默认分支已有新提交，但暂时没有可一键更新的二进制包。"
	}
	if msg := strings.TrimSpace(commitInfo.Commit.Message); msg != "" {
		status.LatestNotes += "\n最新提交：" + firstLine(msg)
	}
	return updateCandidate{Status: status}, nil
}
