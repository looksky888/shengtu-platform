package app

import (
	"context"
	"net/http"
	"strings"
)

func (c *ICloudClient) ListPrivacyMailboxes(ctx context.Context, session ICloudSession) ([]ICloudRemoteMailbox, error) {
	if strings.TrimSpace(session.PremiumMailBaseURL) == "" || strings.TrimSpace(session.DSID) == "" || !iCloudWebLoginSaved(session) {
		return nil, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先协议登录", true)
	}
	var out struct {
		HMEEmails []struct {
			AnonymousID    string `json:"anonymousId"`
			HME            string `json:"hme"`
			Label          string `json:"label"`
			ForwardToEmail string `json:"forwardToEmail"`
			IsActive       bool   `json:"isActive"`
			Origin         string `json:"origin"`
		} `json:"hmeEmails"`
	}
	if err := retryAppleTransient(ctx, func() error {
		return c.call(ctx, session, http.MethodGet, "/v2/hme/list", nil, &out)
	}); err != nil {
		return nil, err
	}
	remotes := make([]ICloudRemoteMailbox, 0, len(out.HMEEmails))
	for _, item := range out.HMEEmails {
		email := strings.ToLower(strings.TrimSpace(item.HME))
		if email == "" {
			continue
		}
		remotes = append(remotes, ICloudRemoteMailbox{
			AnonymousID:    strings.TrimSpace(item.AnonymousID),
			Email:          email,
			Label:          strings.TrimSpace(item.Label),
			ForwardToEmail: strings.TrimSpace(item.ForwardToEmail),
			IsActive:       item.IsActive,
			Origin:         strings.TrimSpace(item.Origin),
		})
	}
	return remotes, nil
}

func (c *ICloudClient) generate(ctx context.Context, session ICloudSession) (string, error) {
	var out struct {
		HME string `json:"hme"`
	}
	if err := c.call(ctx, session, http.MethodPost, "/v1/hme/generate", map[string]string{
		"langCode": "zh-cn",
	}, &out); err != nil {
		return "", err
	}
	if strings.TrimSpace(out.HME) == "" {
		return "", errCode("icloud_generate_empty", "iCloud 未返回候选隐私邮箱", true)
	}
	return strings.TrimSpace(out.HME), nil
}

func (c *ICloudClient) reserve(ctx context.Context, session ICloudSession, hme, label, note string) (ICloudRemoteMailbox, error) {
	var out struct {
		HME struct {
			AnonymousID    string `json:"anonymousId"`
			HME            string `json:"hme"`
			Label          string `json:"label"`
			Note           string `json:"note"`
			ForwardToEmail string `json:"forwardToEmail"`
			IsActive       bool   `json:"isActive"`
		} `json:"hme"`
	}
	if err := c.call(ctx, session, http.MethodPost, "/v1/hme/reserve", map[string]string{
		"hme":   hme,
		"label": label,
		"note":  note,
	}, &out); err != nil {
		return ICloudRemoteMailbox{}, err
	}
	return ICloudRemoteMailbox{
		AnonymousID:    out.HME.AnonymousID,
		Email:          out.HME.HME,
		Label:          out.HME.Label,
		Note:           out.HME.Note,
		ForwardToEmail: out.HME.ForwardToEmail,
		IsActive:       out.HME.IsActive,
		Origin:         "ICLOUD_WEB",
	}, nil
}
