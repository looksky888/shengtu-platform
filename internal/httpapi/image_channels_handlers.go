package httpapi

import (
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const imageChannelsAdminPath = "/api/admin/image-channels"

type imageChannelsResponse struct {
	Channels []service.ImageChannelAdmin `json:"channels"`
}

type imageChannelModelsResponse struct {
	Models []service.ImageChannelModel `json:"models"`
}

type imageChannelPublicModelsResponse struct {
	Models []service.ImageChannelModelPublic `json:"models"`
}

func (a *App) handleAdminImageChannels(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if a.imageChannels == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "生图渠道服务未初始化")
		return
	}
	path := strings.TrimRight(r.URL.Path, "/")
	if path == imageChannelsAdminPath {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, imageChannelsResponse{Channels: a.imageChannels.ListAdmin()})
		case http.MethodPost:
			var input service.ImageChannelInput
			if !readJSONOr400(w, r, &input) {
				return
			}
			channel, err := a.imageChannels.CreateChannel(input)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusCreated, channel)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	parts := strings.Split(strings.TrimPrefix(path, imageChannelsAdminPath+"/"), "/")
	if len(parts) == 1 && parts[0] != "" {
		a.handleAdminImageChannel(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "models" {
		a.handleAdminImageChannelModels(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "discover" {
		a.handleAdminImageChannelDiscover(w, r, parts[0])
		return
	}
	if len(parts) == 3 && parts[1] == "models" && parts[2] != "" {
		a.handleAdminImageChannelModel(w, r, parts[0], parts[2])
		return
	}
	http.NotFound(w, r)
}

func (a *App) handleAdminImageChannelDiscover(w http.ResponseWriter, r *http.Request, channelID string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	channel, err := a.imageChannels.ResolveChannel(channelID)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if channel.Type != service.ImageChannelTypeOpenAICompatible {
		util.WriteError(w, http.StatusBadRequest, "只有 OpenAI 兼容中转站支持拉取模型")
		return
	}
	if channel.BaseURL == "" || channel.APIKey == "" {
		util.WriteError(w, http.StatusBadRequest, "请先配置中转站 URL 和 API Key")
		return
	}
	client := ssrfSafeHTTPClient(a.proxyHTTPClientWithTimeout(channel.TimeoutSeconds), channel.BaseURL, true)
	models, err := fetchProxyModels(r.Context(), client, channel.BaseURL, channel.APIKey, channel.TimeoutSeconds)
	if err != nil {
		util.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, modelsResponse[string]{Models: models})
}

func (a *App) handleAdminImageChannel(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case http.MethodGet:
		for _, item := range a.imageChannels.ListAdmin() {
			if item.ID == id {
				util.WriteJSON(w, http.StatusOK, item)
				return
			}
		}
		util.WriteError(w, http.StatusNotFound, "生图渠道不存在")
	case http.MethodPut, http.MethodPatch:
		var input service.ImageChannelInput
		if !readJSONOr400(w, r, &input) {
			return
		}
		item, err := a.imageChannels.UpdateChannel(id, input)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, item)
	case http.MethodDelete:
		if err := a.imageChannels.DeleteChannel(id); err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleAdminImageChannelModels(w http.ResponseWriter, r *http.Request, channelID string) {
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, imageChannelModelsResponse{Models: a.imageChannels.ListModels(channelID, true)})
	case http.MethodPost:
		var input service.ImageChannelModelInput
		if !readJSONOr400(w, r, &input) {
			return
		}
		model, err := a.imageChannels.CreateModel(channelID, input)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusCreated, model)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleAdminImageChannelModel(w http.ResponseWriter, r *http.Request, channelID, modelID string) {
	switch r.Method {
	case http.MethodPut, http.MethodPatch:
		var input service.ImageChannelModelInput
		if !readJSONOr400(w, r, &input) {
			return
		}
		model, err := a.imageChannels.UpdateModel(channelID, modelID, input)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, model)
	case http.MethodDelete:
		if err := a.imageChannels.DeleteModel(channelID, modelID); err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handlePublicImageChannels(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	util.WriteJSON(w, http.StatusOK, imageChannelPublicModelsResponse{Models: a.imageChannels.ListPublicModels()})
}
