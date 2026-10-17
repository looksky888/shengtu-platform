package hostupdate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const maxReleaseManifestBytes = 1 << 20

type releaseClient struct {
	repository    string
	token         string
	apiBase       string
	platform      string
	expectedImage string
	http          *http.Client
}

type githubRelease struct {
	TagName    string               `json:"tag_name"`
	Draft      bool                 `json:"draft"`
	Prerelease bool                 `json:"prerelease"`
	Assets     []githubReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

func newReleaseClient(opts Options, client *http.Client) *releaseClient {
	return &releaseClient{
		repository: opts.Repository, token: opts.GitHubToken,
		apiBase: opts.GitHubAPIBase, platform: opts.Platform,
		expectedImage: opts.ExpectedImage, http: client,
	}
}

func (c *releaseClient) resolve(ctx context.Context, requestedVersion string) (ReleaseTarget, error) {
	tag := "v" + normalizeVersion(requestedVersion)
	var release githubRelease
	path := "/repos/" + c.repository + "/releases/tags/" + url.PathEscape(tag)
	if err := c.getJSON(ctx, path, &release); err != nil {
		return ReleaseTarget{}, fmt.Errorf("读取 GitHub Release %s: %w", tag, err)
	}
	if release.Draft {
		return ReleaseTarget{}, errors.New("目标 GitHub Release 仍是草稿")
	}
	if !strings.EqualFold(strings.TrimSpace(release.TagName), tag) {
		return ReleaseTarget{}, fmt.Errorf("GitHub Release 标签 %q 与目标 %q 不一致", release.TagName, tag)
	}
	assetID, err := releaseManifestAssetID(release.Assets)
	if err != nil {
		return ReleaseTarget{}, err
	}
	manifest, err := c.downloadManifest(ctx, assetID)
	if err != nil {
		return ReleaseTarget{}, err
	}
	target, err := manifest.validate(requestedVersion, c.platform, c.expectedImage)
	if err != nil {
		return ReleaseTarget{}, err
	}
	if release.Prerelease != (target.Channel == "prerelease") {
		return ReleaseTarget{}, errors.New("GitHub Release 类型与清单发布通道不一致")
	}
	return target, nil
}

func releaseManifestAssetID(assets []githubReleaseAsset) (int64, error) {
	for _, asset := range assets {
		if asset.Name != "update-manifest.json" {
			continue
		}
		if asset.ID <= 0 {
			return 0, errors.New("update-manifest.json 缺少有效 asset id")
		}
		if asset.Size <= 0 || asset.Size > maxReleaseManifestBytes {
			return 0, fmt.Errorf("update-manifest.json 声明大小 %d 超出限制", asset.Size)
		}
		return asset.ID, nil
	}
	return 0, errors.New("GitHub Release 缺少 update-manifest.json")
}

func (c *releaseClient) downloadManifest(ctx context.Context, assetID int64) (releaseManifest, error) {
	var manifest releaseManifest
	req, err := c.request(ctx, fmt.Sprintf("/repos/%s/releases/assets/%d", c.repository, assetID))
	if err != nil {
		return manifest, err
	}
	req.Header.Set("Accept", "application/octet-stream")
	resp, err := c.http.Do(req)
	if err != nil {
		return manifest, fmt.Errorf("下载 update-manifest.json: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return manifest, githubResponseError(resp)
	}
	decoder := json.NewDecoder(io.LimitReader(resp.Body, maxReleaseManifestBytes+1))
	if err := decoder.Decode(&manifest); err != nil {
		return manifest, fmt.Errorf("解析 update-manifest.json: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return manifest, err
	}
	return manifest, nil
}

func (c *releaseClient) getJSON(ctx context.Context, path string, target any) error {
	req, err := c.request(ctx, path)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return githubResponseError(resp)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, maxReleaseManifestBytes)).Decode(target)
}

func (c *releaseClient) request(ctx context.Context, path string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.apiBase, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(c.token) != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "shengtu-host-updater")
	return req, nil
}

func githubResponseError(resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
	var payload struct {
		Message string `json:"message"`
	}
	_ = json.Unmarshal(body, &payload)
	if payload.Message == "" {
		payload.Message = strings.TrimSpace(string(body))
	}
	return fmt.Errorf("GitHub API 返回 HTTP %d: %s", resp.StatusCode, payload.Message)
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("update-manifest.json 包含多个 JSON 值")
		}
		return fmt.Errorf("读取 update-manifest.json 结尾: %w", err)
	}
	return nil
}
