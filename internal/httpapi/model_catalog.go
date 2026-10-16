package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/sidecar"
	"chatgpt2api/internal/util"
)

// handleModelCatalog returns a studio-oriented model catalog (chat + image),
// merging local built-ins with grok-runtime discovery when available.
// Aligns with gptGrok2api GET /api/model-catalog surface for the React FE.
func (a *App) handleModelCatalog(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	chatModels := make([]string, 0, 32)
	imageModels := make([]string, 0, 16)
	imageEditModels := make([]string, 0, 8)
	videoModels := make([]string, 0, 4)
	seenChat := map[string]struct{}{}
	seenImage := map[string]struct{}{}
	seenEdit := map[string]struct{}{}
	seenVideo := map[string]struct{}{}

	addChat := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		// normalize historical aliases
		if id == "gpt-5.5" || id == "gpt-5_5" {
			id = "gpt-5-5"
		}
		if _, ok := seenChat[id]; ok {
			return
		}
		seenChat[id] = struct{}{}
		chatModels = append(chatModels, id)
	}
	addImage := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seenImage[id]; ok {
			return
		}
		seenImage[id] = struct{}{}
		imageModels = append(imageModels, id)
	}
	addEdit := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seenEdit[id]; ok {
			return
		}
		seenEdit[id] = struct{}{}
		imageEditModels = append(imageEditModels, id)
	}
	addVideo := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seenVideo[id]; ok {
			return
		}
		seenVideo[id] = struct{}{}
		videoModels = append(videoModels, id)
	}

	// Built-in catalog (always present as fallback).
	for _, id := range util.ModelList() {
		if util.IsGrokImageModel(id) || util.IsImageGenerationModel(id) && !strings.HasPrefix(id, "gpt-") && id != "auto" {
			if strings.Contains(strings.ToLower(id), "edit") {
				addEdit(id)
			}
			if strings.Contains(strings.ToLower(id), "video") {
				addVideo(id)
			} else {
				addImage(id)
			}
			continue
		}
		if util.IsImageGenerationModel(id) || id == util.ImageModelGPT || id == util.ImageModelAuto {
			addImage(id)
			// auto is both chat selector and image selector in studio
			if id == util.ImageModelAuto {
				addChat(id)
			}
			continue
		}
		addChat(id)
	}
	// Ensure core image models
	addImage(util.ImageModelGPT)
	addImage(util.ImageModelGrokImagine)

	chatSource := "builtin"
	imageSource := "builtin"
	grokSource := "unavailable"

	// Merge from /v1 models engine (may include account-pool extras).
	if a.engine != nil {
		if result, err := a.engine.ListModels(r.Context()); err == nil {
			for _, item := range util.AsMapSlice(result["data"]) {
				id := util.Clean(item["id"])
				if id == "" {
					continue
				}
				lower := strings.ToLower(id)
				if strings.Contains(lower, "video") {
					addVideo(id)
					continue
				}
				if util.IsGrokImageModel(id) || util.IsImageGenerationModel(id) || strings.Contains(lower, "image") || strings.Contains(lower, "imagine") {
					if strings.Contains(lower, "edit") {
						addEdit(id)
					}
					addImage(id)
					continue
				}
				addChat(id)
			}
			chatSource = "builtin+engine"
			imageSource = "builtin+engine"
		}
	}

	// Grok runtime model discovery (internal).
	if a.config != nil {
		base := strings.TrimRight(strings.TrimSpace(a.config.GrokRuntimeBaseURL()), "/")
		token := strings.TrimSpace(a.config.InternalServiceToken())
		if base != "" {
			client := sidecar.New(base, token)
			status, data, err := client.DoJSON(r.Context(), http.MethodGet, "/internal/v1/models", nil)
			if err == nil && status >= 200 && status < 300 && len(data) > 0 {
				var payload map[string]any
				if json.Unmarshal(data, &payload) == nil {
					for _, item := range util.AsMapSlice(payload["data"]) {
						id := util.Clean(item["id"])
						if id == "" {
							continue
						}
						lower := strings.ToLower(id)
						if strings.Contains(lower, "video") {
							addVideo(id)
							continue
						}
						if util.IsGrokImageModel(id) || strings.Contains(lower, "imagine") || strings.Contains(lower, "image") {
							if strings.Contains(lower, "edit") {
								addEdit(id)
							}
							addImage(id)
							continue
						}
						addChat(id)
					}
					grokSource = "runtime"
					chatSource = chatSource + "+grok"
					imageSource = imageSource + "+grok"
				}
			}
		}
	}

	all := make([]string, 0, len(chatModels)+len(imageModels)+len(imageEditModels)+len(videoModels))
	seenAll := map[string]struct{}{}
	for _, list := range [][]string{chatModels, imageModels, imageEditModels, videoModels} {
		for _, id := range list {
			if _, ok := seenAll[id]; ok {
				continue
			}
			seenAll[id] = struct{}{}
			all = append(all, id)
		}
	}

	util.WriteJSON(w, http.StatusOK, modelCatalogResponse{
		Object: "model_catalog", ChatModels: chatModels, ImageModels: imageModels,
		ImageEditModels: imageEditModels, VideoModels: videoModels, AllModels: all,
		Source:               modelCatalogSource{Chat: chatSource, Image: imageSource, Grok: grokSource},
		OpenAIModelsEndpoint: "/v1/models",
		ImageChannelModels: func() []service.ImageChannelModelPublic {
			if a.imageChannels == nil {
				return nil
			}
			return a.imageChannels.ListPublicModels()
		}(),
	})
}
