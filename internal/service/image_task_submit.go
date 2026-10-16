package service

import (
	"context"
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

func (s *ImageTaskService) SubmitGeneration(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("请填写提示词")
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{"prompt": prompt, "model": model, "n": normalizedImageTaskCount(n), "size": size, "quality": quality, "response_format": "url", "base_url": baseURL, "visibility": visibility}
	if messages != nil {
		payload["messages"] = messages
	}
	return s.submit(ctx, identity, clientTaskID, "generate", payload)
}

func (s *ImageTaskService) SubmitGenerationWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadata(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "generate", nil, visibilityValues...)
}

func (s *ImageTaskService) SubmitGenerationWithOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, options ImageOutputOptions, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadataAndOptions(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "generate", nil, options, visibilityValues...)
}

func (s *ImageTaskService) SubmitResponseImageGeneration(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("请填写提示词")
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{"prompt": prompt, "images": images, "model": model, "n": normalizedImageTaskCount(n), "size": size, "quality": quality, "response_format": "url", "base_url": baseURL, "visibility": visibility}
	if messages != nil {
		payload["messages"] = messages
	}
	return s.submit(ctx, identity, clientTaskID, "response-image", payload)
}

func (s *ImageTaskService) SubmitResponseImageGenerationWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, metadata map[string]any, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadata(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "response-image", images, visibilityValues...)
}

func (s *ImageTaskService) SubmitResponseImageGenerationWithOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, metadata map[string]any, options ImageOutputOptions, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadataAndOptions(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "response-image", images, options, visibilityValues...)
}

func (s *ImageTaskService) SubmitEdit(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("请填写提示词")
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{"prompt": prompt, "images": images, "model": model, "n": normalizedImageTaskCount(n), "size": size, "quality": quality, "response_format": "url", "base_url": baseURL, "visibility": visibility}
	if messages != nil {
		payload["messages"] = messages
	}
	return s.submit(ctx, identity, clientTaskID, "edit", payload)
}

func (s *ImageTaskService) SubmitEditWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, metadata map[string]any, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadata(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "edit", images, visibilityValues...)
}

func (s *ImageTaskService) SubmitEditWithOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, metadata map[string]any, options ImageOutputOptions, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadataAndOptions(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "edit", images, options, visibilityValues...)
}

func (s *ImageTaskService) SubmitChat(ctx context.Context, identity Identity, clientTaskID, prompt, model string, messages any) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("请填写提示词")
	}
	if len(util.AsMapSlice(messages)) == 0 {
		return nil, fmt.Errorf("请提供 messages")
	}
	payload := map[string]any{"prompt": prompt, "model": model, "messages": messages, "n": 1, "visibility": ImageVisibilityPrivate}
	return s.submit(ctx, identity, clientTaskID, "chat", payload)
}

func (s *ImageTaskService) SubmitVideo(ctx context.Context, identity Identity, clientTaskID, prompt, model, size string, seconds int, resolutionName, preset string, imageReference any, referenceImages any) (map[string]any, error) {
	return s.SubmitVideoWithOptions(ctx, identity, clientTaskID, prompt, model, size, seconds, resolutionName, preset, imageReference, referenceImages, VideoTaskSubmitOptions{})
}

type VideoTaskSubmitOptions struct {
	RequestFingerprint string
}

func (s *ImageTaskService) SubmitVideoWithOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size string, seconds int, resolutionName, preset string, imageReference any, referenceImages any, options VideoTaskSubmitOptions) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("请填写提示词")
	}
	if seconds == 0 {
		seconds = 6
	}
	if seconds < 1 || seconds > 15 {
		return nil, fmt.Errorf("视频时长必须在 1 到 15 秒之间")
	}
	payload := map[string]any{
		"prompt": prompt, "model": firstNonEmpty(strings.TrimSpace(model), "grok-imagine-video"),
		"size": firstNonEmpty(strings.TrimSpace(size), "720x1280"), "seconds": seconds,
		"resolution_name": strings.TrimSpace(resolutionName), "preset": strings.TrimSpace(preset),
		"n": 1, "visibility": ImageVisibilityPrivate,
	}
	if fingerprint := strings.TrimSpace(options.RequestFingerprint); fingerprint != "" {
		payload["request_fingerprint"] = fingerprint
	}
	if imageReference != nil {
		payload["image_reference"] = imageReference
	}
	if referenceImages != nil {
		payload["reference_images"] = referenceImages
	}
	return s.submit(ctx, identity, clientTaskID, "video", payload)
}

func (s *ImageTaskService) submitImageWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, mode string, images any, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadataAndOptions(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, mode, images, ImageOutputOptions{}, visibilityValues...)
}

func (s *ImageTaskService) submitImageWithMetadataAndOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, mode string, images any, options ImageOutputOptions, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("请填写提示词")
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{"prompt": prompt, "model": model, "n": normalizedImageTaskCount(n), "size": size, "quality": quality, "response_format": "url", "base_url": baseURL, "visibility": visibility}
	if images != nil {
		payload["images"] = images
	}
	if messages != nil {
		payload["messages"] = messages
	}
	mergeImageTaskMetadata(payload, metadata)
	mergeImageOutputOptions(payload, options)
	return s.submit(ctx, identity, clientTaskID, mode, payload)
}
