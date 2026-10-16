package hostupdate

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const releaseManifestSchemaVersion = 1

var (
	repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
	versionPattern    = regexp.MustCompile(`^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$`)
	commitPattern     = regexp.MustCompile(`^[0-9a-f]{40}$`)
	digestPattern     = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
)

type releaseManifest struct {
	SchemaVersion int    `json:"schemaVersion"`
	Version       string `json:"version"`
	Channel       string `json:"channel"`
	Commit        string `json:"commit"`
	Platform      string `json:"platform"`
	Images        struct {
		App struct {
			Reference string `json:"reference"`
			Digest    string `json:"digest"`
		} `json:"app"`
	} `json:"images"`
	Storage struct {
		SchemaVersion    int `json:"schemaVersion"`
		MinSourceVersion int `json:"minSourceSchemaVersion"`
	} `json:"storage"`
}

func (m releaseManifest) validate(requestedVersion, platform, expectedImage string) (ReleaseTarget, error) {
	requestedVersion = normalizeVersion(requestedVersion)
	if !versionPattern.MatchString(requestedVersion) {
		return ReleaseTarget{}, errors.New("目标版本格式无效")
	}
	if m.SchemaVersion != releaseManifestSchemaVersion {
		return ReleaseTarget{}, fmt.Errorf("不支持的发布清单版本 %d", m.SchemaVersion)
	}
	version := normalizeVersion(m.Version)
	if !versionPattern.MatchString(version) || version != requestedVersion {
		return ReleaseTarget{}, fmt.Errorf("发布清单版本 %q 与目标版本 %q 不一致", m.Version, requestedVersion)
	}
	channel := strings.ToLower(strings.TrimSpace(m.Channel))
	if channel != "stable" && channel != "prerelease" {
		return ReleaseTarget{}, fmt.Errorf("发布通道 %q 无效", m.Channel)
	}
	commit := strings.ToLower(strings.TrimSpace(m.Commit))
	if !commitPattern.MatchString(commit) {
		return ReleaseTarget{}, errors.New("发布清单 commit 不是完整的 40 位 Git SHA")
	}
	manifestPlatform := strings.ToLower(strings.TrimSpace(m.Platform))
	if manifestPlatform != strings.ToLower(strings.TrimSpace(platform)) {
		return ReleaseTarget{}, fmt.Errorf("发布平台 %q 与更新器平台 %q 不一致", m.Platform, platform)
	}
	image := strings.ToLower(strings.TrimSpace(m.Images.App.Reference))
	if image != strings.ToLower(strings.TrimSpace(expectedImage)) {
		return ReleaseTarget{}, fmt.Errorf("镜像引用 %q 与受信任仓库 %q 不一致", m.Images.App.Reference, expectedImage)
	}
	digest := strings.ToLower(strings.TrimSpace(m.Images.App.Digest))
	if !digestPattern.MatchString(digest) {
		return ReleaseTarget{}, errors.New("镜像 digest 必须是 sha256 加 64 位十六进制")
	}
	if m.Storage.SchemaVersion < 1 || m.Storage.MinSourceVersion < 1 || m.Storage.MinSourceVersion > m.Storage.SchemaVersion {
		return ReleaseTarget{}, errors.New("发布清单存储结构版本范围无效")
	}
	return ReleaseTarget{
		Version: version, Channel: channel, Commit: commit, Platform: manifestPlatform,
		Image: image, Digest: digest, StorageSchemaVersion: m.Storage.SchemaVersion,
		MinSourceSchemaVersion: m.Storage.MinSourceVersion,
	}, nil
}

func validateStorageUpgrade(current int, target ReleaseTarget) error {
	if current < 1 {
		return fmt.Errorf("当前存储结构版本 %d 无效", current)
	}
	if current < target.MinSourceSchemaVersion {
		return fmt.Errorf("当前存储结构版本 %d 低于目标版本支持的最低来源版本 %d", current, target.MinSourceSchemaVersion)
	}
	if current > target.StorageSchemaVersion {
		return fmt.Errorf("当前存储结构版本 %d 高于目标版本结构 %d，禁止向下覆盖", current, target.StorageSchemaVersion)
	}
	return nil
}

func normalizeVersion(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 1 && (value[0] == 'v' || value[0] == 'V') {
		value = value[1:]
	}
	return strings.TrimSpace(value)
}
