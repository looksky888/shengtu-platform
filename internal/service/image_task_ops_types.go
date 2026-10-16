package service

import "chatgpt2api/internal/util"

type ImageTaskBatchCancelErrorPublic struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type ImageTaskBatchCancelResultPublic struct {
	Cancelled int                               `json:"cancelled"`
	Errors    []ImageTaskBatchCancelErrorPublic `json:"errors"`
}

type ImageTaskClearResultPublic struct {
	Removed   int            `json:"removed"`
	Remaining int            `json:"remaining"`
	Scope     string         `json:"scope"`
	ByStatus  map[string]int `json:"by_status"`
}

type ImageTaskQueueSnapshotPublic struct {
	Items            []ImageTaskPublic `json:"items"`
	Total            int               `json:"total"`
	UpdatedAt        string            `json:"updated_at"`
	PersistenceError string            `json:"persistence_error,omitempty"`
}

func (s *ImageTaskService) AdminCancelTasksTyped(ids []string) ImageTaskBatchCancelResultPublic {
	payload := s.AdminCancelTasks(ids)
	rawErrors, _ := payload["errors"].([]map[string]string)
	errors := make([]ImageTaskBatchCancelErrorPublic, 0, len(rawErrors))
	for _, item := range rawErrors {
		errors = append(errors, ImageTaskBatchCancelErrorPublic{ID: item["id"], Error: item["error"]})
	}
	return ImageTaskBatchCancelResultPublic{Cancelled: util.ToInt(payload["cancelled"], 0), Errors: errors}
}

func (s *ImageTaskService) AdminClearTasksTyped(scope string) (ImageTaskClearResultPublic, error) {
	payload, err := s.AdminClearTasks(scope)
	if err != nil {
		return ImageTaskClearResultPublic{}, err
	}
	byStatus, _ := payload["by_status"].(map[string]int)
	return ImageTaskClearResultPublic{
		Removed: util.ToInt(payload["removed"], 0), Remaining: util.ToInt(payload["remaining"], 0),
		Scope: util.Clean(payload["scope"]), ByStatus: byStatus,
	}, nil
}
