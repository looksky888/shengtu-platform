package service

import "testing"

func TestImageTaskStageDurationSnapshotSeparatesTerminalLanes(t *testing.T) {
	svc := &ImageTaskService{tasks: map[string]*ImageTask{
		"image-a": {Status: TaskStatusSuccess, Mode: "generate", StageDurationsMS: map[string]int64{"queued": 10, "upstream": 100}},
		"image-b": {Status: TaskStatusError, Mode: "edit", StageDurationsMS: map[string]int64{"queued": 20, "upstream": 200}},
		"chat":    {Status: TaskStatusCancelled, Mode: "chat", StageDurationsMS: map[string]int64{"queued": 30, "upstream": 300}},
		"image-c": {Status: TaskStatusSuccess, Mode: "response-image", StageDurationsMS: map[string]int64{"queued": 40, "upstream": 400}},
		"video-a": {Status: TaskStatusSuccess, Mode: "video", StageDurationsMS: map[string]int64{"queued": 50, "polling": 500}},
		"running": {Status: TaskStatusRunning, Mode: "video", StageDurationsMS: map[string]int64{"queued": 999}},
	}}

	got := svc.StageDurationSnapshot()
	if got.Image.Tasks != 3 || got.Video.Tasks != 1 {
		t.Fatalf("lane task counts = image:%d video:%d", got.Image.Tasks, got.Video.Tasks)
	}
	queued := got.Image.Stages["queued"]
	if queued.Samples != 3 || queued.P50MS != 20 || queued.P95MS != 40 {
		t.Fatalf("image queued percentile = %#v", queued)
	}
	polling := got.Video.Stages["polling"]
	if polling.Samples != 1 || polling.P50MS != 500 || polling.P95MS != 500 {
		t.Fatalf("video polling percentile = %#v", polling)
	}
	if _, exists := got.Video.Stages["queued"]; !exists {
		t.Fatalf("video queued stage missing: %#v", got.Video.Stages)
	}
}

func TestImageTaskStageDurationSnapshotUsesEmptyObjects(t *testing.T) {
	got := (*ImageTaskService)(nil).StageDurationSnapshot()
	if got.Image.Stages == nil || got.Video.Stages == nil {
		t.Fatalf("nil service stages must encode as objects: %#v", got)
	}
	if len(got.Image.Stages) != 0 || len(got.Video.Stages) != 0 {
		t.Fatalf("empty service stages = %#v", got)
	}
}

func TestImageTaskOperationsSnapshotSeparatesLanesAndRanksFailures(t *testing.T) {
	svc := &ImageTaskService{tasks: map[string]*ImageTask{
		"image-running": {Status: TaskStatusRunning, Mode: "generate"},
		"image-ok":      {Status: TaskStatusSuccess, Mode: "edit"},
		"image-error-a": {Status: TaskStatusError, Mode: "generate", ErrorCode: "upstream_timeout"},
		"image-error-b": {Status: TaskStatusError, Mode: "generate", ErrorCode: "upstream_timeout"},
		"video-queued":  {Status: TaskStatusQueued, Mode: "video"},
		"video-error":   {Status: TaskStatusError, Mode: "video", ErrorCode: "video_rate_limited"},
	}}

	got := svc.OperationsSnapshot()
	if got.Image.Total != 4 || got.Image.Running != 1 || got.Image.Success != 1 || got.Image.Failed != 2 {
		t.Fatalf("image counts = %#v", got.Image)
	}
	if got.Video.Total != 2 || got.Video.Queued != 1 || got.Video.Failed != 1 {
		t.Fatalf("video counts = %#v", got.Video)
	}
	if len(got.FailureCodes) != 2 || got.FailureCodes[0].Code != "upstream_timeout" || got.FailureCodes[0].Count != 2 {
		t.Fatalf("failure codes = %#v", got.FailureCodes)
	}
}

func TestImageTaskOperationsSnapshotUsesEmptyFailureList(t *testing.T) {
	got := (*ImageTaskService)(nil).OperationsSnapshot()
	if got.FailureCodes == nil || len(got.FailureCodes) != 0 {
		t.Fatalf("nil service failure codes = %#v", got.FailureCodes)
	}
}
