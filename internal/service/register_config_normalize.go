package service

import (
	"strings"

	"chatgpt2api/internal/util"
)

func registerDefaultConfig() RegisterConfig {
	return RegisterConfig{
		Mail: RegisterMailConfig{
			RequestTimeout: 15,
			WaitTimeout:    30,
			WaitInterval:   3,
			Providers:      []map[string]any{},
		},
		Proxy:           "",
		Clearance:       normalizeRegisterClearanceConfig(nil),
		Total:           20000,
		Threads:         64,
		Mode:            registerModeTotal,
		Target:          "openai",
		TargetQuota:     100,
		TargetAvailable: 10,
		CheckInterval:   5,
		Grok:            map[string]any{},
		Enabled:         false,
		Stats:           registerZeroStats(64, map[string]any{"current_quota": 0, "current_available": 0}),
	}
}

func registerZeroStats(threads int, metrics map[string]any) RegisterStats {
	return RegisterStats{
		Success:          0,
		Fail:             0,
		Done:             0,
		Running:          0,
		Threads:          maxInt(1, threads),
		ElapsedSeconds:   0,
		AvgSeconds:       0,
		SuccessRate:      0,
		CurrentQuota:     util.ToInt(metrics["current_quota"], 0),
		CurrentAvailable: util.ToInt(metrics["current_available"], 0),
		UpdatedAt:        util.NowISO(),
	}
}

func normalizeRegisterConfig(raw map[string]any) RegisterConfig {
	if raw == nil {
		raw = map[string]any{}
	}
	base := registerDefaultConfig().toMap()
	for key, value := range raw {
		if key == "stats" || key == "logs" {
			continue
		}
		base[key] = value
	}
	base["proxy"] = strings.TrimSpace(util.Clean(base["proxy"]))
	base["total"] = maxInt(1, util.ToInt(base["total"], 1))
	base["threads"] = maxInt(1, util.ToInt(base["threads"], 1))
	mode := util.Clean(base["mode"])
	if mode != registerModeQuota && mode != registerModeAvailable {
		mode = registerModeTotal
	}
	base["mode"] = mode
	target := strings.ToLower(strings.TrimSpace(util.Clean(base["target"])))
	if target != "grok" {
		target = "openai"
	}
	base["target"] = target
	if grok := util.StringMap(base["grok"]); grok != nil {
		base["grok"] = util.CopyMap(grok)
	} else {
		base["grok"] = map[string]any{}
	}
	base["target_quota"] = maxInt(1, util.ToInt(base["target_quota"], 1))
	base["target_available"] = maxInt(1, util.ToInt(base["target_available"], 1))
	base["check_interval"] = maxInt(1, util.ToInt(base["check_interval"], 5))
	base["enabled"] = util.ToBool(base["enabled"])
	base["mail"] = normalizeRegisterMailConfig(util.StringMap(base["mail"]))
	base["clearance"] = normalizeRegisterClearanceConfig(util.StringMap(base["clearance"])).toMap()
	stats := registerZeroStats(util.ToInt(base["threads"], 1), map[string]any{
		"current_quota":     util.ToInt(util.StringMap(raw["stats"])["current_quota"], 0),
		"current_available": util.ToInt(util.StringMap(raw["stats"])["current_available"], 0),
	})
	statsMap := stats.toMap()
	for key, value := range util.StringMap(raw["stats"]) {
		statsMap[key] = value
	}
	stats = registerStatsFromMap(statsMap)
	stats.Threads = util.ToInt(base["threads"], 1)
	base["stats"] = stats.toMap()
	return registerConfigFromNormalizedMap(base)
}

func registerConfigFromNormalizedMap(base map[string]any) RegisterConfig {
	mailRaw := util.StringMap(base["mail"])
	providers := util.AsMapSlice(mailRaw["providers"])
	if providers == nil {
		providers = []map[string]any{}
	}
	clearanceRaw := util.StringMap(base["clearance"])
	target := strings.ToLower(strings.TrimSpace(util.Clean(base["target"])))
	if target != "grok" {
		target = "openai"
	}
	grok := util.StringMap(base["grok"])
	if grok == nil {
		grok = map[string]any{}
	} else {
		grok = util.CopyMap(grok)
	}
	return RegisterConfig{
		Enabled: util.ToBool(base["enabled"]),
		Target:  target,
		Mail: RegisterMailConfig{
			RequestTimeout: util.ToInt(mailRaw["request_timeout"], 15),
			WaitTimeout:    util.ToInt(mailRaw["wait_timeout"], 30),
			WaitInterval:   util.ToInt(mailRaw["wait_interval"], 3),
			UserAgent:      util.Clean(mailRaw["user_agent"]),
			Providers:      providers,
		},
		Proxy: util.Clean(base["proxy"]),
		Clearance: RegisterClearanceConfig{
			Enabled:                util.ToBool(clearanceRaw["enabled"]),
			Mode:                   util.Clean(clearanceRaw["mode"]),
			FlareSolverrURL:        util.Clean(clearanceRaw["flaresolverr_url"]),
			TimeoutSeconds:         util.ToInt(clearanceRaw["timeout_seconds"], 60),
			RefreshIntervalSeconds: util.ToInt(clearanceRaw["refresh_interval_seconds"], 3600),
			Proxy:                  util.Clean(clearanceRaw["proxy"]),
			UserAgent:              util.Clean(clearanceRaw["user_agent"]),
			CFClearance:            util.Clean(clearanceRaw["cf_clearance"]),
			CFCookies:              util.Clean(clearanceRaw["cf_cookies"]),
		},
		Total:           util.ToInt(base["total"], 1),
		Threads:         util.ToInt(base["threads"], 1),
		Mode:            util.Clean(base["mode"]),
		TargetQuota:     util.ToInt(base["target_quota"], 1),
		TargetAvailable: util.ToInt(base["target_available"], 1),
		CheckInterval:   util.ToInt(base["check_interval"], 5),
		Grok:            grok,
		Stats:           registerStatsFromMap(util.StringMap(base["stats"])),
	}
}

func normalizeRegisterClearanceConfig(raw map[string]any) RegisterClearanceConfig {
	if raw == nil {
		raw = map[string]any{}
	}
	mode := strings.ToLower(strings.TrimSpace(util.Clean(raw["mode"])))
	if mode != "manual" && mode != "flaresolverr" && mode != "none" {
		mode = "flaresolverr"
	}
	return RegisterClearanceConfig{
		Enabled:                util.ToBool(raw["enabled"]),
		Mode:                   mode,
		FlareSolverrURL:        strings.TrimRight(strings.TrimSpace(util.Clean(raw["flaresolverr_url"])), "/"),
		TimeoutSeconds:         maxInt(1, util.ToInt(raw["timeout_seconds"], 60)),
		RefreshIntervalSeconds: maxInt(0, util.ToInt(raw["refresh_interval_seconds"], 3600)),
		Proxy:                  strings.TrimSpace(util.Clean(raw["proxy"])),
		UserAgent:              strings.TrimSpace(util.Clean(raw["user_agent"])),
		CFClearance:            strings.TrimSpace(util.Clean(raw["cf_clearance"])),
		CFCookies:              strings.TrimSpace(util.Clean(raw["cf_cookies"])),
	}
}

func normalizeRegisterMailConfig(raw map[string]any) map[string]any {
	cfg := map[string]any{
		"request_timeout": maxInt(1, util.ToInt(raw["request_timeout"], 15)),
		"wait_timeout":    maxInt(1, util.ToInt(raw["wait_timeout"], 30)),
		"wait_interval":   maxInt(1, util.ToInt(raw["wait_interval"], 3)),
		"user_agent":      firstNonEmpty(util.Clean(raw["user_agent"]), registerUserAgent),
	}
	providers := util.AsMapSlice(raw["providers"])
	out := make([]map[string]any, 0, len(providers))
	for _, provider := range providers {
		item := util.CopyMap(provider)
		item["type"] = util.Clean(item["type"])
		item["enable"] = util.ToBool(item["enable"])
		if item["domain"] != nil {
			item["domain"] = util.AsStringSlice(item["domain"])
		}
		if util.Clean(item["type"]) == "outlook_token" {
			item["mailboxes"] = util.Clean(item["mailboxes"])
			mode := strings.ToLower(util.Clean(item["mode"]))
			if mode != "graph" && mode != "imap" && mode != "auto" {
				mode = "auto"
			}
			item["mode"] = mode
			item["message_limit"] = maxInt(1, util.ToInt(item["message_limit"], 10))
			item["imap_host"] = firstNonEmpty(util.Clean(item["imap_host"]), "outlook.office365.com")
			delete(item, "mailboxes_count")
			delete(item, "mailboxes_preview")
			delete(item, "mailboxes_stats")
		}
		out = append(out, item)
	}
	cfg["providers"] = out
	return cfg
}
