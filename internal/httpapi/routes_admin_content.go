package httpapi

import (
	"net/http"
	"strings"

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
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "announcements" {
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
