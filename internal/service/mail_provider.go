package service

import (
	"chatgpt2api/internal/util"
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"regexp"
	"sync"
	"time"
)

var (
	registerMailDomainMu    sync.Mutex
	registerMailProviderMu  sync.Mutex
	registerMailDomainSeq   int
	registerMailProviderSeq int

	registerMailCodePatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?is)background-color:\s*#F3F3F3[^>]*>[\s\S]*?(\d{6})[\s\S]*?</p>`),
		regexp.MustCompile(`(?i)(?:Verification code|code is|代码|验证码)[:\s]*(\d{6})`),
		regexp.MustCompile(`(?is)>\s*(\d{6})\s*<`),
		regexp.MustCompile(`\b(\d{6})\b`),
	}
)

type registerMailboxProvider interface {
	CreateMailbox(username string) (map[string]any, error)
	FetchLatestMessage(mailbox map[string]any) (map[string]any, error)
	Close()
}

type registerMailSettings struct {
	RequestTimeout time.Duration
	WaitTimeout    time.Duration
	WaitInterval   time.Duration
	UserAgent      string
}

type registerHTTPMailProvider struct {
	client *http.Client
	conf   registerMailSettings
}

type registerCloudflareTempMailProvider struct {
	registerHTTPMailProvider
	entry map[string]any
}

type registerTempMailLOLProvider struct {
	registerHTTPMailProvider
	entry map[string]any
}

type registerDuckMailProvider struct {
	registerHTTPMailProvider
	entry map[string]any
}

type registerGPTMailProvider struct {
	registerHTTPMailProvider
	entry map[string]any
}

type registerMoEmailProvider struct {
	registerHTTPMailProvider
	entry map[string]any
}

func createRegisterMailbox(mailConfig map[string]any, username string) (map[string]any, error) {
	provider, err := createRegisterMailProvider(mailConfig, "", "")
	if err != nil {
		return nil, err
	}
	defer provider.Close()
	return provider.CreateMailbox(username)
}

type registerRecentMailProvider interface {
	FetchRecentMessages(mailbox map[string]any) ([]map[string]any, error)
}

func waitRegisterCode(ctx context.Context, mailConfig map[string]any, mailbox map[string]any) (string, error) {
	provider, err := createRegisterMailProvider(mailConfig, util.Clean(mailbox["provider"]), util.Clean(mailbox["provider_ref"]))
	if err != nil {
		return "", err
	}
	defer provider.Close()
	conf := registerMailSettingsFromConfig(mailConfig)
	deadline := time.NewTimer(conf.WaitTimeout)
	defer deadline.Stop()
	for {
		code, fetchErr := pollRegisterMailCode(provider, mailbox)
		if fetchErr != nil {
			// Token/credential failures should fail the worker so pool state can mark token_invalid.
			if isOutlookTokenError(fetchErr) {
				return "", fetchErr
			}
		} else if code != "" {
			return code, nil
		}
		interval := time.NewTimer(conf.WaitInterval)
		select {
		case <-ctx.Done():
			interval.Stop()
			return "", ctx.Err()
		case <-deadline.C:
			interval.Stop()
			return "", nil
		case <-interval.C:
		}
	}
}

func pollRegisterMailCode(provider registerMailboxProvider, mailbox map[string]any) (string, error) {
	if recent, ok := provider.(registerRecentMailProvider); ok {
		messages, err := recent.FetchRecentMessages(mailbox)
		if err != nil {
			return "", err
		}
		for _, message := range messages {
			if code := extractUnseenRegisterMailCode(mailbox, message); code != "" {
				return code, nil
			}
		}
		return "", nil
	}
	message, err := provider.FetchLatestMessage(mailbox)
	if err != nil {
		return "", err
	}
	if message == nil {
		return "", nil
	}
	return extractUnseenRegisterMailCode(mailbox, message), nil
}

func createRegisterMailProvider(mailConfig map[string]any, providerName, providerRef string) (registerMailboxProvider, error) {
	entry, err := selectRegisterMailEntry(mailConfig, providerName, providerRef)
	if err != nil {
		return nil, err
	}
	conf := registerMailSettingsFromConfig(mailConfig)
	client := registerMailHTTPClient(conf.RequestTimeout)
	base := registerHTTPMailProvider{client: client, conf: conf}
	switch util.Clean(entry["type"]) {
	case "cloudflare_temp_email":
		return &registerCloudflareTempMailProvider{registerHTTPMailProvider: base, entry: entry}, nil
	case "tempmail_lol":
		return &registerTempMailLOLProvider{registerHTTPMailProvider: base, entry: entry}, nil
	case "duckmail":
		return &registerDuckMailProvider{registerHTTPMailProvider: base, entry: entry}, nil
	case "gptmail":
		return &registerGPTMailProvider{registerHTTPMailProvider: base, entry: entry}, nil
	case "moemail":
		return &registerMoEmailProvider{registerHTTPMailProvider: base, entry: entry}, nil
	case "outlook_token":
		return newRegisterOutlookTokenProvider(base, entry), nil
	case "icloud_local", "icloud_api":
		// 3.5: iCloud Privacy Mail (sidecar). Full provider lands with FEATURE_ICLOUD.
		return newRegisterICloudMailProvider(base, entry), nil
	default:
		return nil, fmt.Errorf("不支持的邮箱服务类型: %s", util.Clean(entry["type"]))
	}
}

func registerMailSettingsFromConfig(mailConfig map[string]any) registerMailSettings {
	return registerMailSettings{
		RequestTimeout: time.Duration(maxInt(1, util.ToInt(mailConfig["request_timeout"], 15))) * time.Second,
		WaitTimeout:    time.Duration(maxInt(1, util.ToInt(mailConfig["wait_timeout"], 30))) * time.Second,
		WaitInterval:   time.Duration(maxInt(1, util.ToInt(mailConfig["wait_interval"], 3))) * time.Second,
		UserAgent:      firstNonEmpty(util.Clean(mailConfig["user_agent"]), "Mozilla/5.0"),
	}
}

func registerMailHTTPClient(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		},
	}
}

func registerMailEntries(mailConfig map[string]any) []map[string]any {
	providers := util.AsMapSlice(mailConfig["providers"])
	out := make([]map[string]any, 0, len(providers))
	for index, item := range providers {
		entry := util.CopyMap(item)
		entry["provider_ref"] = fmt.Sprintf("%s#%d", util.Clean(entry["type"]), index+1)
		out = append(out, entry)
	}
	return out
}

func selectRegisterMailEntry(mailConfig map[string]any, providerName, providerRef string) (map[string]any, error) {
	entries := registerMailEntries(mailConfig)
	enabled := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		if util.ToBool(entry["enable"]) {
			enabled = append(enabled, entry)
		}
	}
	if len(enabled) == 0 {
		return nil, fmt.Errorf("没有已启用的邮箱服务")
	}
	if providerRef != "" {
		for _, entry := range entries {
			if util.Clean(entry["provider_ref"]) == providerRef {
				return util.CopyMap(entry), nil
			}
		}
	}
	if providerName != "" {
		for _, entry := range enabled {
			if util.Clean(entry["type"]) == providerName {
				return util.CopyMap(entry), nil
			}
		}
	}
	if len(enabled) == 1 {
		return util.CopyMap(enabled[0]), nil
	}
	registerMailProviderMu.Lock()
	entry := util.CopyMap(enabled[registerMailProviderSeq%len(enabled)])
	registerMailProviderSeq = (registerMailProviderSeq + 1) % len(enabled)
	registerMailProviderMu.Unlock()
	return entry, nil
}

func (p *registerHTTPMailProvider) Close() {
	p.client.CloseIdleConnections()
}
