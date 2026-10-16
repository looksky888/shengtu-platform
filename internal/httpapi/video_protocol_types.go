package httpapi

import "chatgpt2api/internal/service"

type protocolVideo struct {
	ID             string `json:"id"`
	Object         string `json:"object"`
	Status         string `json:"status"`
	Model          string `json:"model,omitempty"`
	CreatedAt      int64  `json:"created_at"`
	Seconds        int    `json:"seconds,omitempty"`
	Size           string `json:"size,omitempty"`
	ResolutionName string `json:"resolution_name,omitempty"`
	TaskID         string `json:"task_id"`
	Progress       int    `json:"progress,omitempty"`
	Error          string `json:"error,omitempty"`
	ContentURL     string `json:"content_url,omitempty"`
}

type protocolVideoList struct {
	Object     string          `json:"object"`
	Data       []protocolVideo `json:"data"`
	Total      int             `json:"total"`
	HasMore    bool            `json:"has_more"`
	NextCursor string          `json:"next_cursor,omitempty"`
}

func protocolVideoFromTask(task service.ImageTaskPublic, contentURL string) protocolVideo {
	return protocolVideo{
		ID: task.ID, Object: "video", Status: protocolVideoStatus(task.Status),
		Model: task.Model, CreatedAt: protocolVideoTimestamp(task.CreatedAt),
		Seconds: task.Seconds, Size: task.Size, ResolutionName: task.ResolutionName,
		TaskID: task.ID, Progress: protocolVideoProgress(task.Progress),
		Error: task.Error, ContentURL: contentURL,
	}
}

func protocolVideoStatus(status string) string {
	switch status {
	case service.TaskStatusQueued:
		return "queued"
	case service.TaskStatusRunning:
		return "in_progress"
	case service.TaskStatusSuccess:
		return "completed"
	case service.TaskStatusCancelled:
		return "cancelled"
	default:
		return "failed"
	}
}
