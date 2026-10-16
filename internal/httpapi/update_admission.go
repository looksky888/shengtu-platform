package httpapi

import (
	"net/http"
	"strings"
	"sync"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

type updateRequestDrainSnapshot struct {
	Accepting bool   `json:"accepting"`
	Draining  bool   `json:"draining"`
	Drained   bool   `json:"drained"`
	Active    int    `json:"active"`
	Reason    string `json:"reason,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
}

type updateAdmissionGate struct {
	mu        sync.Mutex
	draining  bool
	active    int
	reason    string
	startedAt string
}

func newUpdateAdmissionGate() *updateAdmissionGate { return &updateAdmissionGate{} }

func (g *updateAdmissionGate) enter() (func(), error) {
	if g == nil {
		return func() {}, nil
	}
	g.mu.Lock()
	if g.draining {
		message := strings.TrimSpace(g.reason)
		if message == "" {
			message = "服务更新中，暂不接收新的写入请求"
		}
		g.mu.Unlock()
		return nil, service.ImageTaskAdmissionError{Code: service.ImageTaskAdmissionCodeDraining, Message: message}
	}
	g.active++
	g.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			g.mu.Lock()
			if g.active > 0 {
				g.active--
			}
			g.mu.Unlock()
		})
	}, nil
}

func (g *updateAdmissionGate) beginDrain(reason string) updateRequestDrainSnapshot {
	if g == nil {
		return updateRequestDrainSnapshot{Draining: true, Drained: true, Reason: "请求接纳门禁未初始化"}
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if !g.draining {
		g.draining = true
		g.startedAt = util.NowLocal()
	}
	if cleaned := strings.TrimSpace(reason); cleaned != "" {
		g.reason = cleaned
	}
	return g.snapshotLocked()
}

func (g *updateAdmissionGate) resume() updateRequestDrainSnapshot {
	if g == nil {
		return updateRequestDrainSnapshot{Accepting: true, Drained: true}
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.draining = false
	g.reason = ""
	g.startedAt = ""
	return g.snapshotLocked()
}

func (g *updateAdmissionGate) snapshot() updateRequestDrainSnapshot {
	if g == nil {
		return updateRequestDrainSnapshot{Accepting: true, Drained: true}
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.snapshotLocked()
}

func (g *updateAdmissionGate) snapshotLocked() updateRequestDrainSnapshot {
	return updateRequestDrainSnapshot{
		Accepting: !g.draining, Draining: g.draining, Drained: g.active == 0,
		Active: g.active, Reason: g.reason, StartedAt: g.startedAt,
	}
}

func isUpdateSensitiveRequest(method, requestPath string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
	default:
		return false
	}
	// These controls must remain callable while admission is closed, otherwise
	// an aborted update could not inspect or reopen the service.
	switch requestPath {
	case "/api/admin/system/update-drain", "/api/admin/system/update-resume":
		return false
	}
	return true
}
