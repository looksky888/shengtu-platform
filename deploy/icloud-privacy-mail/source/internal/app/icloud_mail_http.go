package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (c *ICloudClient) callMail(ctx context.Context, session ICloudSession, path string, body any, clientIntent string, result any) error {
	base, err := mailGatewayBaseURL(session)
	if err != nil {
		return err
	}
	u, err := c.endpointWithBase(session, base, path)
	if err != nil {
		return err
	}
	if err := validateICloudWebRequestCookies(session, u, time.Now()); err != nil {
		return err
	}
	if clientIntent != "" {
		parsed, _ := url.Parse(u)
		q := parsed.Query()
		q.Set("clientIntent", clientIntent)
		parsed.RawQuery = q.Encode()
		u = parsed.String()
	}
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, reader)
	if err != nil {
		return err
	}
	if clientIntent != "" {
		req.Header.Set("Content-Type", "text/plain;charset=UTF-8")
	} else {
		req.Header.Set("Content-Type", "application/json")
	}
	setICloudFetchHeaders(req, session, "*/*", req.Header.Get("Content-Type"))
	webState, _ := iCloudWebLoginState(session)
	if cookie := cookieHeader(webState.Cookies, u); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("icloud mail %s HTTP %d: %s", path, resp.StatusCode, trimForError(data))
	}
	if result != nil {
		if err := json.Unmarshal(data, result); err != nil {
			return errCode("icloud_mail_bad_response", "iCloud 邮件返回无法解析", true)
		}
	}
	return nil
}

func (c *ICloudClient) endpoint(session ICloudSession, path string) (string, error) {
	return c.endpointWithBase(session, session.PremiumMailBaseURL, path)
}

func (c *ICloudClient) endpointWithBase(session ICloudSession, baseURL, path string) (string, error) {
	base, err := url.Parse(strings.TrimRight(baseURL, "/") + "/")
	if err != nil {
		return "", err
	}
	rel := &url.URL{Path: strings.TrimLeft(path, "/")}
	u := base.ResolveReference(rel)
	q := u.Query()
	q.Set("clientBuildNumber", firstNonEmpty(session.ClientBuildNumber, "2622Build20"))
	q.Set("clientMasteringNumber", firstNonEmpty(session.MasteringNumber, session.ClientBuildNumber, "2622Build20"))
	q.Set("clientId", firstNonEmpty(session.ClientID, "local-panel"))
	q.Set("dsid", session.DSID)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func mailGatewayBaseURL(session ICloudSession) (string, error) {
	if strings.TrimSpace(session.MailGatewayBaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(session.MailGatewayBaseURL), "/"), nil
	}
	if strings.TrimSpace(session.MailBaseURL) != "" {
		base := strings.TrimRight(strings.TrimSpace(session.MailBaseURL), "/")
		base = strings.Replace(base, "-mailws.", "-mccgateway.", 1)
		return base, nil
	}
	if strings.TrimSpace(session.PremiumMailBaseURL) != "" {
		base := strings.TrimRight(strings.TrimSpace(session.PremiumMailBaseURL), "/")
		base = strings.Replace(base, "-maildomainws.", "-mccgateway.", 1)
		return base, nil
	}
	return "", errCode("icloud_mail_missing", "未保存 iCloud 邮件服务地址，请重新保存登录态", true)
}
