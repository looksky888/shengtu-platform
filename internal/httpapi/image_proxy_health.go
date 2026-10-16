package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/storage"
)

const imageProxyHealthMaxEvents = 30

type imageProxyHealth struct {
	mu     sync.Mutex
	path   string
	events []imageProxyHealthEvent
}

type imageProxyHealthEvent struct {
	At         time.Time `json:"at"`
	Success    bool      `json:"success"`
	Model      string    `json:"model"`
	Path       string    `json:"path"`
	DurationMS int64     `json:"duration_ms"`
	StatusCode int       `json:"status_code"`
	Code       string    `json:"code"`
	Message    string    `json:"message"`
}

type imageProxyHealthState struct {
	Events []imageProxyHealthEvent `json:"events"`
}

// ImageProxyHealthEventPublic is one recent proxy health event for API.
type ImageProxyHealthEventPublic struct {
	At         string `json:"at"`
	Success    bool   `json:"success"`
	Model      string `json:"model,omitempty"`
	Path       string `json:"path,omitempty"`
	DurationMS int64  `json:"duration_ms"`
	StatusCode int    `json:"status_code"`
	Code       string `json:"code,omitempty"`
	Message    string `json:"message,omitempty"`
}

// ImageProxyModelHealthPublic is per-model proxy health for API.
type ImageProxyModelHealthPublic struct {
	Model            string `json:"model"`
	Total            int    `json:"total"`
	Success          int    `json:"success"`
	Failed           int    `json:"failed"`
	SuccessRate      int    `json:"success_rate"`
	RateLimited      int    `json:"rate_limited"`
	Timeout          int    `json:"timeout"`
	GatewayErrors    int    `json:"gateway_errors"`
	AverageLatencyMS int    `json:"average_latency_ms"`
	LastStatus       string `json:"last_status,omitempty"`
	LastSuccessAt    string `json:"last_success_at,omitempty"`
	LastErrorAt      string `json:"last_error_at,omitempty"`
	LastErrorCode    string `json:"last_error_code,omitempty"`
	LastError        string `json:"last_error,omitempty"`
}

// ImageProxyHealthSnapshot is the core proxy health aggregate for API.
type ImageProxyHealthSnapshot struct {
	Total            int                           `json:"total"`
	Success          int                           `json:"success"`
	Failed           int                           `json:"failed"`
	SuccessRate      int                           `json:"success_rate"`
	RateLimited      int                           `json:"rate_limited"`
	Timeout          int                           `json:"timeout"`
	GatewayErrors    int                           `json:"gateway_errors"`
	HTTP502          int                           `json:"http_502"`
	HTTP524          int                           `json:"http_524"`
	AverageLatencyMS int                           `json:"average_latency_ms"`
	LastStatus       string                        `json:"last_status"`
	LastSuccessAt    string                        `json:"last_success_at,omitempty"`
	LastErrorAt      string                        `json:"last_error_at,omitempty"`
	LastError        string                        `json:"last_error,omitempty"`
	LastErrorCode    string                        `json:"last_error_code,omitempty"`
	Recent           []ImageProxyHealthEventPublic `json:"recent"`
	Models           []ImageProxyModelHealthPublic `json:"models"`
}

// ImageProxyHealthAdminSnapshot extends core health with provider config + channel splits.
type ImageProxyHealthAdminSnapshot struct {
	ImageProxyHealthSnapshot
	Provider          string                              `json:"provider,omitempty"`
	Model             string                              `json:"model,omitempty"`
	BaseURLConfigured bool                                `json:"base_url_configured"`
	APIKeyConfigured  bool                                `json:"api_key_configured"`
	Channels          map[string]ImageProxyHealthSnapshot `json:"channels,omitempty"`
}

func newImageProxyHealth(paths ...string) *imageProxyHealth {
	h := &imageProxyHealth{events: make([]imageProxyHealthEvent, 0, imageProxyHealthMaxEvents)}
	if len(paths) > 0 {
		h.path = strings.TrimSpace(paths[0])
		h.load()
	}
	return h
}

func (h *imageProxyHealth) Record(event imageProxyHealthEvent) error {
	if h == nil {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if event.At.IsZero() {
		event.At = time.Now()
	}
	h.events = append(h.events, event)
	if len(h.events) > imageProxyHealthMaxEvents {
		h.events = append([]imageProxyHealthEvent(nil), h.events[len(h.events)-imageProxyHealthMaxEvents:]...)
	}
	events := append([]imageProxyHealthEvent(nil), h.events...)
	return h.save(h.path, events)
}

func (h *imageProxyHealth) Snapshot() ImageProxyHealthSnapshot {
	if h == nil {
		return emptyImageProxyHealthSnapshot()
	}
	h.mu.Lock()
	events := append([]imageProxyHealthEvent(nil), h.events...)
	h.mu.Unlock()
	return imageProxyHealthSnapshot(events)
}

func emptyImageProxyHealthSnapshot() ImageProxyHealthSnapshot {
	return ImageProxyHealthSnapshot{
		LastStatus: "unknown",
		Recent:     []ImageProxyHealthEventPublic{},
		Models:     []ImageProxyModelHealthPublic{},
	}
}

func imageProxyHealthSnapshot(events []imageProxyHealthEvent) ImageProxyHealthSnapshot {
	if len(events) == 0 {
		return emptyImageProxyHealthSnapshot()
	}
	summary := emptyImageProxyHealthSnapshot()
	recent := make([]ImageProxyHealthEventPublic, 0, len(events))
	models := map[string]*imageProxyModelHealth{}
	var totalLatency int64
	for i := len(events) - 1; i >= 0; i-- {
		event := events[i]
		totalLatency += event.DurationMS
		collectImageProxyModelHealth(models, event)
		if event.Success {
			summary.Success++
			if summary.LastSuccessAt == "" {
				summary.LastSuccessAt = event.At.Format(time.RFC3339)
			}
		} else {
			summary.Failed++
			if summary.LastErrorAt == "" {
				summary.LastErrorAt = event.At.Format(time.RFC3339)
				summary.LastError = event.Message
				summary.LastErrorCode = event.Code
			}
		}
		if event.StatusCode == http.StatusTooManyRequests || event.Code == "upstream_rate_limited" {
			summary.RateLimited++
		}
		if event.StatusCode == http.StatusGatewayTimeout || event.StatusCode == 524 || event.Code == "upstream_timeout" {
			summary.Timeout++
		}
		if event.StatusCode >= 500 {
			summary.GatewayErrors++
		}
		// Explicit Cloudflare/origin gateway markers for dashboards and alerts.
		if event.StatusCode == http.StatusBadGateway || strings.Contains(event.Code, "http_502") {
			summary.HTTP502++
		}
		if event.StatusCode == 524 || strings.Contains(event.Code, "http_524") {
			summary.HTTP524++
		}
		recent = append(recent, imageProxyHealthEventPublic(event))
	}
	total := len(events)
	summary.Total = total
	summary.SuccessRate = int(float64(summary.Success) / float64(total) * 100)
	summary.AverageLatencyMS = int(totalLatency / int64(total))
	if last := events[len(events)-1]; last.Success {
		summary.LastStatus = "success"
	} else {
		summary.LastStatus = "failed"
	}
	summary.Recent = recent
	summary.Models = imageProxyModelHealthList(models)
	return summary
}

type imageProxyModelHealth struct {
	Model        string
	Total        int
	Success      int
	Failed       int
	RateLimited  int
	Timeout      int
	GatewayError int
	LatencyMS    int64
	LastEventAt  time.Time
	LastSuccess  time.Time
	LastError    time.Time
	LastStatus   string
	LastCode     string
	LastMessage  string
}

func collectImageProxyModelHealth(models map[string]*imageProxyModelHealth, event imageProxyHealthEvent) {
	model := strings.TrimSpace(event.Model)
	if model == "" {
		model = "unknown_model"
	}
	item := models[model]
	if item == nil {
		item = &imageProxyModelHealth{Model: model, LastStatus: "unknown"}
		models[model] = item
	}
	item.Total++
	item.LatencyMS += event.DurationMS
	if event.At.After(item.LastEventAt) {
		item.LastEventAt = event.At
		if event.Success {
			item.LastStatus = "success"
		} else {
			item.LastStatus = "failed"
			item.LastCode = event.Code
			item.LastMessage = event.Message
		}
	}
	if event.Success {
		item.Success++
		if event.At.After(item.LastSuccess) {
			item.LastSuccess = event.At
		}
	} else {
		item.Failed++
		if event.At.After(item.LastError) {
			item.LastError = event.At
			item.LastCode = event.Code
			item.LastMessage = event.Message
		}
	}
	if event.StatusCode == http.StatusTooManyRequests || event.Code == "upstream_rate_limited" {
		item.RateLimited++
	}
	if event.StatusCode == http.StatusGatewayTimeout || event.StatusCode == 524 || event.Code == "upstream_timeout" {
		item.Timeout++
	}
	if event.StatusCode >= 500 {
		item.GatewayError++
	}
}

func imageProxyModelHealthList(models map[string]*imageProxyModelHealth) []ImageProxyModelHealthPublic {
	items := make([]*imageProxyModelHealth, 0, len(models))
	for _, item := range models {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Total == items[j].Total {
			return items[i].Model < items[j].Model
		}
		return items[i].Total > items[j].Total
	})
	out := make([]ImageProxyModelHealthPublic, 0, len(items))
	for _, item := range items {
		averageLatency := 0
		successRate := 0
		if item.Total > 0 {
			averageLatency = int(item.LatencyMS / int64(item.Total))
			successRate = int(float64(item.Success) / float64(item.Total) * 100)
		}
		row := ImageProxyModelHealthPublic{
			Model:            item.Model,
			Total:            item.Total,
			Success:          item.Success,
			Failed:           item.Failed,
			SuccessRate:      successRate,
			RateLimited:      item.RateLimited,
			Timeout:          item.Timeout,
			GatewayErrors:    item.GatewayError,
			AverageLatencyMS: averageLatency,
			LastStatus:       item.LastStatus,
		}
		if !item.LastSuccess.IsZero() {
			row.LastSuccessAt = item.LastSuccess.Format(time.RFC3339)
		}
		if !item.LastError.IsZero() {
			row.LastErrorAt = item.LastError.Format(time.RFC3339)
			row.LastErrorCode = item.LastCode
			row.LastError = item.LastMessage
		}
		out = append(out, row)
	}
	return out
}

func imageProxyHealthEventPublic(event imageProxyHealthEvent) ImageProxyHealthEventPublic {
	return ImageProxyHealthEventPublic{
		At:         event.At.Format(time.RFC3339),
		Success:    event.Success,
		Model:      event.Model,
		Path:       event.Path,
		DurationMS: event.DurationMS,
		StatusCode: event.StatusCode,
		Code:       event.Code,
		Message:    event.Message,
	}
}

func imageProxyHealthErrorFields(err error) (int, string, string) {
	if err == nil {
		return http.StatusOK, "", ""
	}
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) {
		return imageErr.StatusCode, imageErr.Code, imageErr.Message
	}
	return http.StatusBadGateway, "image_proxy_error", err.Error()
}

func (h *imageProxyHealth) load() {
	if h == nil || h.path == "" {
		return
	}
	data, err := os.ReadFile(h.path)
	if err != nil {
		return
	}
	var state imageProxyHealthState
	if err := json.Unmarshal(data, &state); err != nil {
		return
	}
	if len(state.Events) > imageProxyHealthMaxEvents {
		state.Events = state.Events[len(state.Events)-imageProxyHealthMaxEvents:]
	}
	h.events = append(h.events[:0], state.Events...)
}

func (h *imageProxyHealth) save(path string, events []imageProxyHealthEvent) error {
	if path == "" {
		return nil
	}
	if len(events) > imageProxyHealthMaxEvents {
		events = events[len(events)-imageProxyHealthMaxEvents:]
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(imageProxyHealthState{Events: events}, "", "  ")
	if err != nil {
		return err
	}
	return storage.AtomicWriteFile(path, data, 0o600)
}
