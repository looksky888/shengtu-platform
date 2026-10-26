package httpapi

import (
	"fmt"
	"net/url"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

// imageTaskRouteMetadata freezes the route selected at submission time. A
// queued task must keep this route even if an administrator changes settings
// before the worker starts.
func (a *App) imageTaskRouteMetadata(model string) map[string]any {
	model = firstNonEmpty(strings.TrimSpace(model), util.ImageModelAuto)
	channel := a.resolveImageChannel(model)
	metadata := map[string]any{"effective_model": model}
	source := "default"
	if a != nil && a.config != nil {
		source = a.config.ImageProviderSource()
	}
	switch channel {
	case imageProviderGrokNative:
		metadata["effective_provider"] = service.ImageTaskProviderGrokRuntime
		metadata["effective_channel"] = service.ImageTaskChannelGrokRuntime
		metadata["provider_source"] = "model_route"
		if a != nil && a.config != nil {
			metadata["upstream_host"] = routeHost(a.config.GrokRuntimeBaseURL())
		}
	case imageProviderProxyAPI:
		metadata["effective_provider"] = service.ImageTaskProviderProxyAPI
		metadata["effective_channel"] = service.ImageTaskChannelProxyAPI
		metadata["provider_source"] = source
		if a != nil && a.config != nil {
			metadata["upstream_host"] = routeHost(a.config.ImageProxyBaseURL())
			if model == util.ImageModelAuto && strings.TrimSpace(a.config.ImageProxyModel()) != "" {
				metadata["effective_model"] = a.config.ImageProxyModel()
			}
		}
	default:
		metadata["effective_provider"] = service.ImageTaskProviderAccountPool
		metadata["effective_channel"] = service.ImageTaskChannelAccountPool
		metadata["provider_source"] = source
		metadata["upstream_host"] = "chatgpt.com"
	}
	return metadata
}

func (a *App) imageTaskRouteMetadataForRequest(body map[string]any, model, capability string) (map[string]any, error) {
	channelModelID := strings.TrimSpace(util.Clean(body["channel_model_id"]))
	if channelModelID == "" {
		if a != nil && a.imageChannels != nil {
			resolved, matched, err := a.imageChannels.ResolveSystemModelByUpstream(model, capability)
			if err != nil {
				return nil, err
			}
			if matched {
				return imageTaskRouteMetadataFromResolved(resolved, body), nil
			}
		}
		return a.imageTaskRouteMetadata(model), nil
	}
	if a == nil || a.imageChannels == nil {
		return nil, fmt.Errorf("生图渠道服务未初始化")
	}
	resolved, err := a.imageChannels.ResolveModel(channelModelID)
	if err != nil {
		return nil, err
	}
	if !containsString(resolved.Capabilities, capability) {
		capabilityName := "图片生成"
		if capability == service.ImageCapabilityEdit {
			capabilityName = "图片编辑"
		}
		return nil, fmt.Errorf("所选模型不支持%s", capabilityName)
	}
	return imageTaskRouteMetadataFromResolved(resolved, body), nil
}

func imageTaskRouteMetadataFromResolved(resolved service.ResolvedImageChannelModel, body map[string]any) map[string]any {
	provider := service.ImageTaskProviderAccountPool
	channel := service.ImageTaskChannelAccountPool
	switch resolved.ChannelType {
	case service.ImageChannelTypeOpenAICompatible:
		provider, channel = service.ImageTaskProviderProxyAPI, "image_channel:"+resolved.ChannelID
	case service.ImageChannelTypeGrokRuntime:
		provider, channel = service.ImageTaskProviderGrokRuntime, service.ImageTaskChannelGrokRuntime
	}
	resolution := firstNonEmpty(strings.TrimSpace(util.Clean(body["image_resolution"])), strings.TrimSpace(util.Clean(body["size"])))
	return map[string]any{
		"channel_model_id": resolved.ID, "channel_id": resolved.ChannelID, "channel_name": resolved.ChannelName,
		"effective_provider": provider, "effective_channel": channel, "provider_source": "channel_model",
		"effective_model": resolved.UpstreamModel, "upstream_host": routeHost(resolved.BaseURL),
		"image_credit_cost": service.ImageChannelModelCreditCost(resolved, resolution), "channel_base_url": resolved.BaseURL,
		"channel_api_key": resolved.APIKey, "channel_timeout_seconds": resolved.TimeoutSeconds,
		"channel_max_retries": resolved.MaxRetries, "channel_download_urls": resolved.DownloadURLs,
		"channel_max_concurrency": resolved.MaxConcurrency,
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (a *App) resolveImageChannelForTask(body map[string]any, model string) string {
	if provider := strings.TrimSpace(util.Clean(body["effective_provider"])); provider != "" {
		switch provider {
		case service.ImageTaskProviderGrokRuntime:
			return imageProviderGrokNative
		case service.ImageTaskProviderProxyAPI:
			return imageProviderProxyAPI
		case service.ImageTaskProviderAccountPool:
			return imageProviderAccountPool
		}
	}
	return a.resolveImageChannel(model)
}

func routeHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err == nil && parsed.Hostname() != "" {
		return strings.ToLower(parsed.Hostname())
	}
	if parsed, err := url.Parse("//" + raw); err == nil && parsed.Hostname() != "" {
		return strings.ToLower(parsed.Hostname())
	}
	return ""
}
