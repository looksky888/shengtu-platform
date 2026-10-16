package service

import (
	"strconv"
	"strings"
)

func compareVersions(current, latest string) int {
	currentParts := versionParts(current)
	latestParts := versionParts(latest)
	for i := 0; i < len(currentParts) || i < len(latestParts); i++ {
		var currentPart, latestPart int
		if i < len(currentParts) {
			currentPart = currentParts[i]
		}
		if i < len(latestParts) {
			latestPart = latestParts[i]
		}
		if currentPart < latestPart {
			return -1
		}
		if currentPart > latestPart {
			return 1
		}
	}
	return 0
}

func versionParts(value string) []int {
	value = strings.TrimPrefix(strings.TrimSpace(value), "v")
	if idx := strings.IndexAny(value, "-+"); idx >= 0 {
		value = value[:idx]
	}
	fields := strings.Split(value, ".")
	out := make([]int, 0, len(fields))
	for _, field := range fields {
		if len(out) == 3 {
			break
		}
		part, err := strconv.Atoi(strings.TrimSpace(field))
		if err != nil || part < 0 {
			part = 0
		}
		out = append(out, part)
	}
	for len(out) < 3 {
		out = append(out, 0)
	}
	return out
}

func cloneUpdateInfo(info *UpdateInfo) *UpdateInfo {
	if info == nil {
		return nil
	}
	out := *info
	if info.ReleaseInfo != nil {
		release := *info.ReleaseInfo
		release.Assets = append([]Asset(nil), info.ReleaseInfo.Assets...)
		out.ReleaseInfo = &release
	}
	return &out
}
