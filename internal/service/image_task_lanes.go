package service

import (
	"strings"

	"chatgpt2api/internal/util"
)

const (
	imageTaskLaneLocal = "local"
	imageTaskLaneRelay = "relay"
)

// imageTaskLane freezes the executor lane from the submission metadata. A
// relay task must never fall into the local account-pool worker lane.
func imageTaskLane(mode string, payload map[string]any) string {
	if strings.TrimSpace(mode) == "video" {
		return "video"
	}
	provider := util.Clean(payload["effective_provider"])
	channel := util.Clean(payload["effective_channel"])
	if provider == ImageTaskProviderProxyAPI || channel == ImageTaskChannelProxyAPI || strings.HasPrefix(channel, "image_channel:") {
		return imageTaskLaneRelay
	}
	return imageTaskLaneLocal
}

func imageTaskLaneFromRecord(task *ImageTask) string {
	if task == nil {
		return imageTaskLaneLocal
	}
	return imageTaskLane(task.Mode, map[string]any{
		"effective_provider": task.EffectiveProvider,
		"effective_channel":  task.EffectiveChannel,
	})
}
