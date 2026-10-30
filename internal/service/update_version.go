package service

import (
	"regexp"
	"strconv"
	"strings"
)

var datedVersionSuffix = regexp.MustCompile(`^(\d{8})(?:[-.+]|$)`)

type comparableVersion struct {
	parts      [3]int
	date       int
	prerelease bool
}

func compareVersions(current, latest string) int {
	currentVersion := parseComparableVersion(current)
	latestVersion := parseComparableVersion(latest)
	for i := range currentVersion.parts {
		if currentVersion.parts[i] < latestVersion.parts[i] {
			return -1
		}
		if currentVersion.parts[i] > latestVersion.parts[i] {
			return 1
		}
	}
	if currentVersion.date < latestVersion.date {
		return -1
	}
	if currentVersion.date > latestVersion.date {
		return 1
	}
	if currentVersion.prerelease != latestVersion.prerelease {
		if currentVersion.prerelease {
			return -1
		}
		return 1
	}
	return 0
}

func parseComparableVersion(value string) comparableVersion {
	normalized := strings.TrimPrefix(strings.TrimSpace(value), "v")
	core, suffix, _ := strings.Cut(normalized, "-")
	core, _, _ = strings.Cut(core, "+")
	fields := strings.Split(core, ".")
	var result comparableVersion
	for i := 0; i < len(fields) && i < len(result.parts); i++ {
		part, err := strconv.Atoi(strings.TrimSpace(fields[i]))
		if err == nil && part >= 0 {
			result.parts[i] = part
		}
	}
	if match := datedVersionSuffix.FindStringSubmatch(suffix); len(match) == 2 {
		result.date, _ = strconv.Atoi(match[1])
	}
	lower := strings.ToLower(suffix)
	for _, marker := range []string{"alpha", "beta", "rc", "dev", "canary", "nightly"} {
		if strings.Contains(lower, marker) {
			result.prerelease = true
			break
		}
	}
	return result
}

func cloneUpdateInfo(info *UpdateInfo) *UpdateInfo {
	if info == nil {
		return nil
	}
	out := *info
	if info.ReleaseInfo != nil {
		release := *info.ReleaseInfo
		release.Assets = cloneNonNilSlice(info.ReleaseInfo.Assets)
		out.ReleaseInfo = &release
	}
	return &out
}
