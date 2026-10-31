package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleAdminBackup(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	switch {
	case r.URL.Path == "/api/admin/backup" || r.URL.Path == "/api/admin/backup/config":
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, a.backup.GetTyped())
		case http.MethodPost:
			body, err := readJSONMap(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
				return
			}
			payload, err := a.backup.UpdateTyped(body)
			if err != nil {
				util.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, payload)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	case r.URL.Path == "/api/admin/backup/run":
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, a.backup.RunStatusTyped())
		case http.MethodPost:
			result, err := a.backup.TriggerTyped()
			if err != nil {
				util.WriteJSON(w, http.StatusServiceUnavailable, result)
				return
			}
			util.WriteJSON(w, http.StatusAccepted, result)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	default:
		http.NotFound(w, r)
	}
}

func (a *App) handlePublicAnnouncements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	util.WriteJSON(w, http.StatusOK, itemsResponse[service.AnnouncementPublic]{
		Items: a.announce.ListVisibleTyped(strings.TrimSpace(r.URL.Query().Get("target"))),
	})
}

func (a *App) handlePublicAnnouncementEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	target := strings.TrimSpace(r.URL.Query().Get("target"))
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	flusher, _ := w.(http.Flusher)

	updates := a.announce.Subscribe(r.Context())
	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-a.ShutdownRequested():
			return
		case _, ok := <-updates:
			if !ok {
				return
			}
			payload, err := json.Marshal(itemsResponse[service.AnnouncementPublic]{
				Items: a.announce.ListVisibleTyped(target),
			})
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
	}
}

func (a *App) handleAdminAnnouncements(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	base := "/api/admin/announcements"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, itemsResponse[service.AnnouncementPublic]{Items: a.announce.ListAllTyped()})
		case http.MethodPost:
			body, err := readJSONMap(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
				return
			}
			if util.Clean(body["content"]) == "" {
				util.WriteError(w, http.StatusBadRequest, "请填写公告内容")
				return
			}
			item, err := a.announce.Create(body)
			if err != nil {
				util.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, itemListResponse[service.AnnouncementPublic]{
				Item:  service.AnnouncementPublicFromMap(item, true),
				Items: a.announce.ListAllTyped(),
			})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "announcements" && parts[4] == "broadcast" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		item, err := a.announce.Broadcast(parts[3])
		if err != nil {
			if errors.Is(err, service.ErrAnnouncementDisabled) {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if item == nil {
			util.WriteError(w, http.StatusNotFound, "公告不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemListResponse[service.AnnouncementPublic]{
			Item:  service.AnnouncementPublicFromMap(item, true),
			Items: a.announce.ListAllTyped(),
		})
		return
	}
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "admin" || parts[2] == "" || parts[2] != "announcements" {
		http.NotFound(w, r)
		return
	}
	id := parts[3]
	switch r.Method {
	case http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
			return
		}
		if value, exists := body["content"]; exists && util.Clean(value) == "" {
			util.WriteError(w, http.StatusBadRequest, "请填写公告内容")
			return
		}
		item, err := a.announce.Update(id, body)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if item == nil {
			util.WriteError(w, http.StatusNotFound, "公告不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemListResponse[service.AnnouncementPublic]{
			Item:  service.AnnouncementPublicFromMap(item, true),
			Items: a.announce.ListAllTyped(),
		})
	case http.MethodDelete:
		okDel, err := a.announce.Delete(id)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !okDel {
			util.WriteError(w, http.StatusNotFound, "公告不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemsResponse[service.AnnouncementPublic]{Items: a.announce.ListAllTyped()})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
