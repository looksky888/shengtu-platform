package httpapi

import (
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func (a *App) recordProxyImageHealth(start time.Time, cfg imageProxyConfig, path string, err error) {
	if a == nil || a.proxyStats == nil {
		return
	}
	statusCode, code, message := imageProxyHealthErrorFields(err)
	model := cfg.Model
	if channel := strings.TrimSpace(cfg.Channel); channel != "" && model != "" {
		model = channel + ":" + model
	} else if channel := strings.TrimSpace(cfg.Channel); channel != "" {
		model = channel
	}
	if saveErr := a.proxyStats.Record(imageProxyHealthEvent{
		At:         time.Now(),
		Success:    err == nil,
		Model:      model,
		Path:       path,
		DurationMS: time.Since(start).Milliseconds(),
		StatusCode: statusCode,
		Code:       code,
		Message:    message,
	}); saveErr != nil && a.logger != nil {
		a.logger.Warning("image proxy health persistence failed", "error", saveErr.Error())
	}
}

func (a *App) imageProxyHealthSnapshot() ImageProxyHealthAdminSnapshot {
	core := emptyImageProxyHealthSnapshot()
	var events []imageProxyHealthEvent
	if a != nil && a.proxyStats != nil {
		core = a.proxyStats.Snapshot()
		events = a.proxyStats.eventsCopy()
	}
	out := ImageProxyHealthAdminSnapshot{ImageProxyHealthSnapshot: core}
	if a != nil && a.config != nil {
		out.Provider = a.config.ImageProvider()
		out.Model = a.config.ImageProxyModel()
		out.BaseURLConfigured = a.config.ImageProxyBaseURL() != ""
		out.APIKeyConfigured = a.config.ImageProxyAPIKey() != ""
	}
	out.Channels = map[string]ImageProxyHealthSnapshot{
		"proxy_api":    summarizeHealthEventsByChannel(events, imageProviderProxyAPI),
		"account_pool": emptyImageProxyHealthSnapshot(),
	}
	return out
}

func (h *imageProxyHealth) eventsCopy() []imageProxyHealthEvent {
	if h == nil {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]imageProxyHealthEvent, len(h.events))
	copy(out, h.events)
	return out
}

func summarizeHealthEventsByChannel(events []imageProxyHealthEvent, channel string) ImageProxyHealthSnapshot {
	channel = strings.TrimSpace(channel)
	if channel == "" {
		return emptyImageProxyHealthSnapshot()
	}
	prefix := channel + ":"
	var filtered []imageProxyHealthEvent
	for _, event := range events {
		model := strings.TrimSpace(event.Model)
		if strings.HasPrefix(model, prefix) || model == channel {
			clone := event
			if strings.HasPrefix(model, prefix) {
				clone.Model = strings.TrimPrefix(model, prefix)
			}
			filtered = append(filtered, clone)
		}
	}
	return imageProxyHealthSnapshot(filtered)
}

func (a *App) handleImageProxyHealth(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	util.WriteJSON(w, http.StatusOK, healthResponse[ImageProxyHealthAdminSnapshot]{Health: a.imageProxyHealthSnapshot()})
}
