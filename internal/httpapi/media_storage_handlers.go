package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

type mediaStorageOverview struct {
	Health             service.MediaStorageHealth      `json:"health"`
	Migration          service.MediaMigrationStatus    `json:"migration"`
	Cleanup            service.MediaLocalCleanupStatus `json:"cleanup"`
	ActiveProvider     string                          `json:"active_provider"`
	ConfiguredProvider string                          `json:"configured_provider"`
	RestartRequired    bool                            `json:"restart_required"`
}

type mediaStorageRuntimeState struct {
	ActiveProvider     string `json:"active_provider"`
	ConfiguredProvider string `json:"configured_provider"`
	RestartRequired    bool   `json:"restart_required"`
}

type mediaStorageHealthResponse struct {
	Health service.MediaStorageHealth `json:"health"`
}

type mediaStorageMigrationResponse struct {
	Migration service.MediaMigrationStatus `json:"migration"`
}

type mediaStorageCleanupResponse struct {
	Cleanup service.MediaLocalCleanupStatus `json:"cleanup"`
}

func (a *App) handleAdminMediaStorage(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	path := strings.TrimSuffix(r.URL.Path, "/")
	switch path {
	case "/api/admin/media-storage":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		a.handleMediaStorageOverview(w, r)
	case "/api/admin/media-storage/test":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		a.handleMediaStorageTest(w, r)
	case "/api/admin/media-storage/migration":
		switch r.Method {
		case http.MethodGet:
			a.handleMediaStorageMigrationStatus(w, r)
		case http.MethodPost:
			a.handleMediaStorageMigrationTrigger(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	case "/api/admin/media-storage/local-cleanup":
		switch r.Method {
		case http.MethodGet:
			a.handleMediaStorageCleanupStatus(w, r)
		case http.MethodPost:
			a.handleMediaStorageCleanupTrigger(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	default:
		http.NotFound(w, r)
	}
}

func (a *App) handleMediaStorageOverview(w http.ResponseWriter, r *http.Request) {
	runtime := a.mediaStorageRuntimeState()
	library, err := a.configuredR2MediaLibrary()
	if err != nil {
		util.WriteJSON(w, http.StatusOK, mediaStorageOverview{
			Health:             service.MediaStorageHealth{Provider: a.config.MediaStorageProvider(), Status: "unconfigured", Error: err.Error()},
			Migration:          service.MediaMigrationStatus{State: "idle"},
			Cleanup:            service.MediaLocalCleanupStatus{State: "idle"},
			ActiveProvider:     runtime.ActiveProvider,
			ConfiguredProvider: runtime.ConfiguredProvider,
			RestartRequired:    runtime.RestartRequired,
		})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	util.WriteJSON(w, http.StatusOK, mediaStorageOverview{
		Health:             library.Health(ctx),
		Migration:          library.MigrationStatus(),
		Cleanup:            library.LocalCleanupStatus(),
		ActiveProvider:     runtime.ActiveProvider,
		ConfiguredProvider: runtime.ConfiguredProvider,
		RestartRequired:    runtime.RestartRequired,
	})
}

func (a *App) handleMediaStorageTest(w http.ResponseWriter, r *http.Request) {
	body, ok := readJSONMapOr400(w, r)
	if !ok {
		return
	}
	valueOrConfigured := func(key string, configured string) string {
		if value := strings.TrimSpace(util.Clean(body[key])); value != "" {
			return value
		}
		return configured
	}
	cfg := service.MediaR2ConnectionConfig{
		AccountID:       valueOrConfigured("account_id", a.config.MediaR2AccountID()),
		AccessKeyID:     valueOrConfigured("access_key_id", a.config.MediaR2AccessKeyID()),
		SecretAccessKey: valueOrConfigured("secret_access_key", a.config.MediaR2SecretAccessKey()),
		Bucket:          valueOrConfigured("bucket", a.config.MediaR2Bucket()),
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := service.TestMediaR2Connection(ctx, cfg); err != nil {
		util.WriteJSON(w, http.StatusOK, mediaStorageHealthResponse{Health: service.MediaStorageHealth{Provider: "r2", Status: "error", Error: err.Error()}})
		return
	}
	util.WriteJSON(w, http.StatusOK, mediaStorageHealthResponse{Health: service.MediaStorageHealth{Provider: "r2", Status: "ok"}})
}

func (a *App) handleMediaStorageMigrationStatus(w http.ResponseWriter, _ *http.Request) {
	library, err := a.configuredR2MediaLibrary()
	if err != nil {
		util.WriteJSON(w, http.StatusOK, mediaStorageMigrationResponse{Migration: service.MediaMigrationStatus{State: "idle", Error: err.Error()}})
		return
	}
	util.WriteJSON(w, http.StatusOK, mediaStorageMigrationResponse{Migration: library.MigrationStatus()})
}

func (a *App) handleMediaStorageMigrationTrigger(w http.ResponseWriter, _ *http.Request) {
	library, err := a.configuredR2MediaLibrary()
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusAccepted, mediaStorageMigrationResponse{Migration: library.TriggerLegacyImageMigration()})
}

func (a *App) handleMediaStorageCleanupStatus(w http.ResponseWriter, _ *http.Request) {
	library, err := a.configuredR2MediaLibrary()
	if err != nil {
		util.WriteJSON(w, http.StatusOK, mediaStorageCleanupResponse{Cleanup: service.MediaLocalCleanupStatus{State: "idle", Error: err.Error()}})
		return
	}
	util.WriteJSON(w, http.StatusOK, mediaStorageCleanupResponse{Cleanup: library.LocalCleanupStatus()})
}

func (a *App) handleMediaStorageCleanupTrigger(w http.ResponseWriter, r *http.Request) {
	body, ok := readJSONMapOr400(w, r)
	if !ok {
		return
	}
	mode := util.Clean(body["mode"])
	if mode == "delete" && a.mediaStorageRuntimeState().RestartRequired {
		util.WriteError(w, http.StatusConflict, "媒体存储设置尚未在当前进程生效，请重启主应用后再清理本地副本")
		return
	}
	library, err := a.configuredR2MediaLibrary()
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	status := library.TriggerLocalCleanup(mode, util.Clean(body["confirmation_token"]))
	if status.State == "failed" {
		util.WriteError(w, http.StatusUnprocessableEntity, status.Error)
		return
	}
	util.WriteJSON(w, http.StatusAccepted, mediaStorageCleanupResponse{Cleanup: status})
}

func (a *App) mediaStorageRuntimeState() mediaStorageRuntimeState {
	active := "local"
	if a != nil && a.media != nil {
		active = "r2"
	}
	configured := "local"
	if a != nil && a.config != nil {
		configured = a.config.MediaStorageProvider()
	}
	return mediaStorageRuntimeState{
		ActiveProvider:     active,
		ConfiguredProvider: configured,
		RestartRequired:    active != configured,
	}
}

func (a *App) configuredR2MediaLibrary() (*service.MediaLibrary, error) {
	if a == nil || a.config == nil {
		return nil, errors.New("媒体存储配置不可用")
	}
	if a.media != nil {
		return a.media, nil
	}
	key := util.SHA256Hex(strings.Join([]string{
		a.config.MediaR2AccountID(), a.config.MediaR2AccessKeyID(), a.config.MediaR2SecretAccessKey(),
		a.config.MediaR2Bucket(), a.config.MediaR2Prefix(),
	}, "\x00"))
	a.mediaMu.Lock()
	defer a.mediaMu.Unlock()
	if a.mediaAdmin != nil && a.mediaKey == key {
		return a.mediaAdmin, nil
	}
	if a.mediaAdmin != nil && a.mediaAdmin.MigrationStatus().State == "running" {
		return nil, errors.New("旧图片迁移正在运行，请等待完成后再修改 R2 配置")
	}
	backend, err := a.config.StorageBackend()
	if err != nil {
		return nil, err
	}
	library, err := service.NewR2MediaLibrary(a.rootCtx, a.config, backend, a.logger)
	if err != nil {
		return nil, err
	}
	library.Start(a.rootCtx)
	a.mediaAdmin = library
	a.mediaKey = key
	return library, nil
}
