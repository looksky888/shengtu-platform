package service

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func (w *registerWorker) step(text string) {
	w.service.appendLog(fmt.Sprintf("[任务%d] %s", w.index, text), "")
}

func (s *RegisterService) load() (RegisterConfig, bool) {
	value, err := loadStoredJSONWithError(s.store, s.docName, s.path)
	if err != nil {
		return normalizeRegisterConfig(nil), false
	}
	raw, ok := value.(map[string]any)
	if !ok {
		return normalizeRegisterConfig(nil), true
	}
	return normalizeRegisterConfig(raw), true
}

func (s *RegisterService) saveLocked() error {
	if !s.storeReady {
		return fmt.Errorf("注册配置未成功加载，已拒绝写入以防清空存储")
	}
	return saveStoredJSON(s.store, s.docName, s.path, s.config)
}

func (s *RegisterService) snapshotLocked() map[string]any {
	out := s.config.toMap()
	// Deep-copy providers so enrich/stats never mutates persisted config.
	mail := util.StringMap(out["mail"])
	providers := util.AsMapSlice(mail["providers"])
	copied := make([]map[string]any, 0, len(providers))
	for _, provider := range providers {
		copied = append(copied, util.CopyMap(provider))
	}
	mail["providers"] = copied
	out["mail"] = mail
	logs := make([]map[string]any, len(s.logs))
	for i, item := range s.logs {
		logs[i] = item.toMap()
	}
	out["logs"] = logs
	// Local/personal deploy: keep full mailbox credentials in API responses.
	// (Previously redacted mailboxes to "" which also broke register workers that used Get().)
	enrichOutlookPools(out)
	return out
}

// outlookRedactEnabled controls whether API responses strip outlook mailboxes secrets.
// CHATGPT2API_OUTLOOK_REDACT=true|false overrides.
// Default: redact when deployment is not source/dev (safer for public/production).
func outlookRedactEnabled() bool {
	v := strings.TrimSpace(os.Getenv("CHATGPT2API_OUTLOOK_REDACT"))
	if v != "" {
		return v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes") || strings.EqualFold(v, "on")
	}
	dep := strings.ToLower(strings.TrimSpace(os.Getenv("CHATGPT2API_DEPLOYMENT")))
	if dep == "source" || dep == "dev" || dep == "development" || dep == "local" {
		return false
	}
	return true
}

// enrichOutlookPools attaches pool count/stats/preview.
// When redaction is on, mailboxes text is cleared and emails are masked (secrets remain on disk only).
func enrichOutlookPools(snapshot map[string]any) {
	mail := util.StringMap(snapshot["mail"])
	if len(mail) == 0 {
		return
	}
	providers := util.AsMapSlice(mail["providers"])
	redact := outlookRedactEnabled()
	changed := false
	for _, provider := range providers {
		if util.Clean(provider["type"]) != "outlook_token" {
			continue
		}
		credentials := parseOutlookCredentials(util.Clean(provider["mailboxes"]))
		provider["mailboxes_count"] = len(credentials)
		preview := make([]string, 0, len(credentials))
		for _, credential := range credentials {
			if redact {
				preview = append(preview, maskOutlookEmail(credential.Email))
			} else {
				preview = append(preview, credential.Email)
			}
		}
		provider["mailboxes_preview"] = preview
		stats, err := outlookTokenPoolStats(credentials)
		provider["mailboxes_stats"] = stats
		if err != nil {
			provider["mailboxes_state_error"] = err.Error()
		} else {
			delete(provider, "mailboxes_state_error")
		}
		if redact {
			provider["mailboxes"] = ""
		}
		changed = true
	}
	if changed {
		mail["providers"] = providers
		snapshot["mail"] = mail
	}
}

func (s *RegisterService) mergeOutlookPoolsLocked(updates map[string]any) {
	mail := util.StringMap(updates["mail"])
	if len(mail) == 0 {
		return
	}
	providers := util.AsMapSlice(mail["providers"])
	if len(providers) == 0 {
		return
	}
	oldProviders := s.config.Mail.Providers
	for index, provider := range providers {
		if util.Clean(provider["type"]) != "outlook_token" {
			continue
		}
		old := map[string]any{}
		if index < len(oldProviders) {
			old = oldProviders[index]
		}
		oldText := ""
		if util.Clean(old["type"]) == "outlook_token" {
			oldText = util.Clean(old["mailboxes"])
		}
		newText := util.Clean(provider["mailboxes"])
		if oldText != "" || newText != "" {
			provider["mailboxes"] = mergeOutlookPool(oldText, newText)
		} else {
			provider["mailboxes"] = ""
		}
		delete(provider, "mailboxes_count")
		delete(provider, "mailboxes_preview")
		delete(provider, "mailboxes_stats")
		delete(provider, "mailboxes_state_error")
		providers[index] = provider
	}
	mail["providers"] = providers
	updates["mail"] = mail
}

func (s *RegisterService) pruneUnusedOutlookPoolsLocked() (int, error) {
	providers := s.config.Mail.Providers
	if len(providers) == 0 {
		return 0, nil
	}
	totalRemoved := 0
	next := make([]map[string]any, 0, len(providers))
	for _, provider := range providers {
		item := util.CopyMap(provider)
		if util.Clean(item["type"]) != "outlook_token" {
			next = append(next, item)
			continue
		}
		credentials := parseOutlookCredentials(util.Clean(item["mailboxes"]))
		kept, removed, err := pruneOutlookUnusedCredentials(credentials)
		if err != nil {
			return 0, err
		}
		if removed > 0 {
			item["mailboxes"] = serializeOutlookPool(kept)
			totalRemoved += removed
		}
		delete(item, "mailboxes_count")
		delete(item, "mailboxes_preview")
		delete(item, "mailboxes_stats")
		delete(item, "mailboxes_state_error")
		next = append(next, item)
	}
	s.config.Mail.Providers = next
	return totalRemoved, nil
}

func (s *RegisterService) snapshotJSONLocked() string {
	data, err := json.Marshal(s.snapshotLocked())
	if err != nil {
		return "{}"
	}
	return string(data)
}

func (s *RegisterService) notifyLocked() {
	payload := s.snapshotJSONLocked()
	for ch := range s.subscribers {
		select {
		case ch <- payload:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- payload:
			default:
			}
		}
	}
}

func (s *RegisterService) appendLog(text, level string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.appendLogLocked(text, level)
}

func (s *RegisterService) appendLogLocked(text, level string) {
	item := RegisterLog{
		Time:  util.NowISO(),
		Text:  text,
		Level: firstNonEmpty(level, "info"),
	}
	s.logs = append(s.logs, item)
	if len(s.logs) > 300 {
		s.logs = append([]RegisterLog(nil), s.logs[len(s.logs)-300:]...)
	}
	s.notifyLocked()
}

func (s *RegisterService) poolMetricsLocked() map[string]any {
	if s.accounts == nil {
		return map[string]any{"current_quota": 0, "current_available": 0}
	}
	items := s.accounts.ListAccounts()
	quota := 0
	available := 0
	for _, item := range items {
		if util.Clean(item["status"]) != "正常" {
			continue
		}
		available++
		if !util.ToBool(item["imageQuotaUnknown"]) {
			quota += util.ToInt(item["quota"], 0)
		}
	}
	return map[string]any{"current_quota": quota, "current_available": available}
}

func (s *RegisterService) targetReached(cfg map[string]any, submitted int) bool {
	metrics := s.poolMetrics()
	s.bumpStats(metrics)
	mode := util.Clean(cfg["mode"])
	switch mode {
	case registerModeQuota:
		reached := util.ToInt(metrics["current_quota"], 0) >= util.ToInt(cfg["target_quota"], 1)
		s.appendLog(fmt.Sprintf("检查号池：当前正常账号=%d，当前剩余额度=%d，目标额度=%d，%s", util.ToInt(metrics["current_available"], 0), util.ToInt(metrics["current_quota"], 0), util.ToInt(cfg["target_quota"], 1), registerSkipText(reached)), "yellow")
		return reached
	case registerModeAvailable:
		reached := util.ToInt(metrics["current_available"], 0) >= util.ToInt(cfg["target_available"], 1)
		s.appendLog(fmt.Sprintf("检查号池：当前正常账号=%d，目标账号=%d，当前剩余额度=%d，%s", util.ToInt(metrics["current_available"], 0), util.ToInt(cfg["target_available"], 1), util.ToInt(metrics["current_quota"], 0), registerSkipText(reached)), "yellow")
		return reached
	default:
		return submitted >= util.ToInt(cfg["total"], 1)
	}
}

func registerSkipText(reached bool) string {
	if reached {
		return "跳过注册"
	}
	return "继续注册"
}

func (s *RegisterService) poolMetrics() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.poolMetricsLocked()
}

func (s *RegisterService) bumpStats(updates map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	statsMap := s.config.Stats.toMap()
	for key, value := range updates {
		statsMap[key] = value
	}
	if startedAt := util.Clean(statsMap["started_at"]); startedAt != "" {
		if started, err := time.Parse(time.RFC3339Nano, startedAt); err == nil {
			elapsed := math.Round(time.Since(started).Seconds()*10) / 10
			statsMap["elapsed_seconds"] = elapsed
			success := util.ToInt(statsMap["success"], 0)
			fail := util.ToInt(statsMap["fail"], 0)
			if success > 0 {
				statsMap["avg_seconds"] = math.Round((elapsed/float64(success))*10) / 10
			} else {
				statsMap["avg_seconds"] = 0
			}
			statsMap["success_rate"] = math.Round((float64(success)*100/float64(maxInt(1, success+fail)))*10) / 10
		}
	}
	statsMap["updated_at"] = util.NowISO()
	previous := s.config.Stats
	s.config.Stats = registerStatsFromMap(statsMap)
	if err := s.saveLocked(); err != nil {
		s.config.Stats = previous
		log.Printf("persist register stats failed: %v", err)
		return
	}
	s.notifyLocked()
}

func cloneMap(in map[string]any) map[string]any {
	if in == nil {
		return map[string]any{}
	}
	data, err := json.Marshal(in)
	if err != nil {
		return util.CopyMap(in)
	}
	var out map[string]any
	if json.Unmarshal(data, &out) != nil {
		return util.CopyMap(in)
	}
	return out
}
