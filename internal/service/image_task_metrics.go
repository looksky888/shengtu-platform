package service

import (
	"sort"
	"strings"

	"chatgpt2api/internal/util"
)

type TaskStatusCountsPublic struct {
	Total     int `json:"total"`
	Queued    int `json:"queued"`
	Running   int `json:"running"`
	Success   int `json:"success"`
	Failed    int `json:"failed"`
	Cancelled int `json:"cancelled"`
}

type TaskFailureCodePublic struct {
	Code  string `json:"code"`
	Count int    `json:"count"`
}

type ImageTaskOperationsPublic struct {
	Image        TaskStatusCountsPublic  `json:"image"`
	Video        TaskStatusCountsPublic  `json:"video"`
	FailureCodes []TaskFailureCodePublic `json:"failure_codes"`
}

// OperationsSnapshot summarizes retained tasks for the admin operations view.
// It reads the in-memory index only and never scans media files or databases.
func (s *ImageTaskService) OperationsSnapshot() ImageTaskOperationsPublic {
	result := ImageTaskOperationsPublic{FailureCodes: []TaskFailureCodePublic{}}
	if s == nil {
		return result
	}
	s.mu.RLock()
	failures := make(map[string]int)
	for _, task := range s.tasks {
		if task == nil {
			continue
		}
		counts := &result.Image
		if util.Clean(task.Mode) == "video" {
			counts = &result.Video
		}
		counts.Total++
		switch util.Clean(task.Status) {
		case TaskStatusQueued:
			counts.Queued++
		case TaskStatusRunning:
			counts.Running++
		case TaskStatusSuccess:
			counts.Success++
		case TaskStatusError:
			counts.Failed++
			code := strings.TrimSpace(task.ErrorCode)
			if code == "" {
				code = "unknown"
			}
			failures[code]++
		case TaskStatusCancelled:
			counts.Cancelled++
		}
	}
	s.mu.RUnlock()
	result.FailureCodes = make([]TaskFailureCodePublic, 0, len(failures))
	for code, count := range failures {
		result.FailureCodes = append(result.FailureCodes, TaskFailureCodePublic{Code: code, Count: count})
	}
	sort.Slice(result.FailureCodes, func(i, j int) bool {
		if result.FailureCodes[i].Count == result.FailureCodes[j].Count {
			return result.FailureCodes[i].Code < result.FailureCodes[j].Code
		}
		return result.FailureCodes[i].Count > result.FailureCodes[j].Count
	})
	if len(result.FailureCodes) > 8 {
		result.FailureCodes = result.FailureCodes[:8]
	}
	return result
}

type TaskStagePercentilePublic struct {
	Samples int   `json:"samples"`
	P50MS   int64 `json:"p50_ms"`
	P95MS   int64 `json:"p95_ms"`
}

type TaskStageDurationLanePublic struct {
	Tasks  int                                  `json:"tasks"`
	Stages map[string]TaskStagePercentilePublic `json:"stages"`
}

type ImageTaskStageDurationsPublic struct {
	Image TaskStageDurationLanePublic `json:"image"`
	Video TaskStageDurationLanePublic `json:"video"`
}

// StageDurationSnapshot summarizes retained terminal tasks. It does not mutate
// task state and deliberately excludes in-flight partial stage durations.
func (s *ImageTaskService) StageDurationSnapshot() ImageTaskStageDurationsPublic {
	if s == nil {
		return emptyTaskStageDurationSnapshot()
	}
	s.mu.RLock()
	imageValues := make(map[string][]int64)
	videoValues := make(map[string][]int64)
	imageTasks := 0
	videoTasks := 0
	for _, task := range s.tasks {
		if task == nil || !isTerminalTaskStatus(util.Clean(task.Status)) || len(task.StageDurationsMS) == 0 {
			continue
		}
		values := imageValues
		switch util.Clean(task.Mode) {
		case "video":
			values = videoValues
			videoTasks++
		case "generate", "edit", "response-image":
			imageTasks++
		default:
			// Chat and unknown modes are not media-generation stages.
			continue
		}
		for stage, duration := range task.StageDurationsMS {
			stage = util.Clean(stage)
			if stage == "" || duration < 0 {
				continue
			}
			values[stage] = append(values[stage], duration)
		}
	}
	s.mu.RUnlock()
	return ImageTaskStageDurationsPublic{
		Image: summarizeStageDurations(imageTasks, imageValues),
		Video: summarizeStageDurations(videoTasks, videoValues),
	}
}

func isTerminalTaskStatus(status string) bool {
	switch status {
	case TaskStatusSuccess, TaskStatusError, TaskStatusCancelled:
		return true
	default:
		return false
	}
}

func emptyTaskStageDurationSnapshot() ImageTaskStageDurationsPublic {
	return ImageTaskStageDurationsPublic{
		Image: TaskStageDurationLanePublic{Stages: map[string]TaskStagePercentilePublic{}},
		Video: TaskStageDurationLanePublic{Stages: map[string]TaskStagePercentilePublic{}},
	}
}

func summarizeStageDurations(tasks int, values map[string][]int64) TaskStageDurationLanePublic {
	stages := make(map[string]TaskStagePercentilePublic, len(values))
	for stage, durations := range values {
		if len(durations) == 0 {
			continue
		}
		sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
		stages[stage] = TaskStagePercentilePublic{
			Samples: len(durations),
			P50MS:   nearestRank(durations, 50),
			P95MS:   nearestRank(durations, 95),
		}
	}
	return TaskStageDurationLanePublic{Tasks: tasks, Stages: stages}
}

func nearestRank(sorted []int64, percentile int) int64 {
	if len(sorted) == 0 {
		return 0
	}
	index := (percentile*len(sorted) + 99) / 100
	if index < 1 {
		index = 1
	}
	if index > len(sorted) {
		index = len(sorted)
	}
	return sorted[index-1]
}
