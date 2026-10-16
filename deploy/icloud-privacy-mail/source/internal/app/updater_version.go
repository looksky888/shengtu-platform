package app

import (
	"strings"
)

func selectManifestAsset(assets []updateManifestAsset, goos, goarch, preferred string) (updateManifestAsset, bool) {
	preferred = strings.TrimSpace(preferred)
	for _, asset := range assets {
		if preferred != "" && strings.EqualFold(strings.TrimSpace(asset.Name), preferred) {
			return asset, true
		}
	}
	for _, asset := range assets {
		if !strings.EqualFold(strings.TrimSpace(asset.OS), goos) || !strings.EqualFold(strings.TrimSpace(asset.Arch), goarch) {
			continue
		}
		if strings.TrimSpace(asset.URL) == "" {
			continue
		}
		if isArchiveAssetName(asset.Name) {
			continue
		}
		return asset, true
	}
	return updateManifestAsset{}, false
}

func selectGitHubReleaseAsset(assets []githubReleaseAsset, goos, goarch, preferred string) (githubReleaseAsset, bool) {
	preferred = strings.TrimSpace(preferred)
	for _, asset := range assets {
		if preferred != "" && strings.EqualFold(strings.TrimSpace(asset.Name), preferred) && strings.TrimSpace(asset.BrowserDownloadURL) != "" {
			return asset, true
		}
	}
	for _, asset := range assets {
		name := strings.TrimSpace(asset.Name)
		url := strings.TrimSpace(asset.BrowserDownloadURL)
		lower := strings.ToLower(name)
		if url == "" || strings.Contains(lower, "sha256") || strings.Contains(lower, "checksum") || isArchiveAssetName(name) {
			continue
		}
		if strings.Contains(lower, strings.ToLower(goos)) && strings.Contains(lower, strings.ToLower(goarch)) {
			return asset, true
		}
	}
	return githubReleaseAsset{}, false
}

func isArchiveAssetName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	return strings.HasSuffix(lower, ".zip") ||
		strings.HasSuffix(lower, ".tar.gz") ||
		strings.HasSuffix(lower, ".tgz") ||
		strings.HasSuffix(lower, ".gz") ||
		strings.HasSuffix(lower, ".7z") ||
		strings.HasSuffix(lower, ".rar")
}

func versionIsNewer(current, latest string) bool {
	current = normalizeVersion(current)
	latest = normalizeVersion(latest)
	if latest == "" {
		return false
	}
	if current == "" || strings.Contains(current, "dev") || strings.Contains(current, "unknown") {
		return latest != current
	}
	if current == latest {
		return false
	}
	curParts := splitVersionParts(current)
	latParts := splitVersionParts(latest)
	max := len(curParts)
	if len(latParts) > max {
		max = len(latParts)
	}
	for i := 0; i < max; i++ {
		var cur, lat int
		if i < len(curParts) {
			cur = curParts[i]
		}
		if i < len(latParts) {
			lat = latParts[i]
		}
		if lat > cur {
			return true
		}
		if lat < cur {
			return false
		}
	}
	return false
}

func normalizeVersion(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimPrefix(value, "version")
	value = strings.TrimSpace(value)
	return strings.TrimPrefix(value, "v")
}

func splitVersionParts(value string) []int {
	fields := strings.FieldsFunc(value, func(r rune) bool {
		return r < '0' || r > '9'
	})
	out := make([]int, 0, len(fields))
	for _, field := range fields {
		if field == "" {
			continue
		}
		var n int
		for _, r := range field {
			n = n*10 + int(r-'0')
		}
		out = append(out, n)
	}
	return out
}
