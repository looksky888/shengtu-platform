package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestImageTaskServiceDrainRejectsNewWorkAndCanResume(t *testing.T) {
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		started <- struct{}{}
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(filepath.Join(t.TempDir(), "image_tasks.json"), handler, handler, handler, func() int { return 30 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "active", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(active) error = %v", err)
	}
	waitForStartedTaskSignal(t, started)

	drain := svc.BeginDrain("版本更新准备中")
	if drain.Accepting || !drain.Draining || drain.Drained || drain.Running != 1 || drain.Reason != "版本更新准备中" {
		t.Fatalf("BeginDrain() = %#v", drain)
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "new", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err == nil {
		t.Fatal("SubmitGeneration(new) error = nil, want drain rejection")
	} else {
		var admissionErr ImageTaskAdmissionError
		if !errors.As(err, &admissionErr) || admissionErr.Code != ImageTaskAdmissionCodeDraining {
			t.Fatalf("SubmitGeneration(new) error = %#v", err)
		}
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "active", "different", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("idempotent SubmitGeneration(active) during drain error = %v", err)
	}

	close(release)
	waitForTaskStatus(t, svc, identity, "active", TaskStatusSuccess)
	drain = svc.DrainSnapshot()
	if !drain.Drained || drain.Active != 0 || drain.Accepting {
		t.Fatalf("DrainSnapshot() after completion = %#v", drain)
	}

	resumed, err := svc.ResumeAdmission()
	if err != nil {
		t.Fatalf("ResumeAdmission() error = %v", err)
	}
	if !resumed.Accepting || resumed.Draining {
		t.Fatalf("ResumeAdmission() = %#v", resumed)
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "resumed", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(resumed) error = %v", err)
	}
	waitForTaskStatus(t, svc, identity, "resumed", TaskStatusSuccess)
}

func waitForStartedTaskSignal(t *testing.T, started <-chan struct{}) {
	t.Helper()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for task handler to start")
	}
}
