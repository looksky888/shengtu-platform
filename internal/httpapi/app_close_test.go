package httpapi

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestAppCloseReturnsErrorsAndCompletesCleanup(t *testing.T) {
	taskErr := errors.New("task persistence failed")
	usageErr := errors.New("usage aggregate flush failed")
	loggerErr := errors.New("logger close failed")
	storageErr := errors.New("storage close failed")
	steps := make([]string, 0, 5)
	app := &App{
		closeTasks: func(ctx context.Context) error {
			steps = append(steps, "tasks")
			if _, ok := ctx.Deadline(); !ok {
				t.Fatal("task close context must have a deadline")
			}
			return taskErr
		},
		cancel: func() {
			steps = append(steps, "cancel")
		},
		closeUsage: func() error {
			steps = append(steps, "usage")
			return usageErr
		},
		closeLog: func() error {
			steps = append(steps, "logger")
			return loggerErr
		},
		closeStorage: func() error {
			steps = append(steps, "storage")
			return storageErr
		},
	}

	err := app.Close()
	if !errors.Is(err, taskErr) {
		t.Fatalf("Close() error = %v, want task error", err)
	}
	if !errors.Is(err, loggerErr) {
		t.Fatalf("Close() error = %v, want logger error", err)
	}
	if !errors.Is(err, usageErr) {
		t.Fatalf("Close() error = %v, want usage aggregate error", err)
	}
	if !errors.Is(err, storageErr) {
		t.Fatalf("Close() error = %v, want storage error", err)
	}
	if want := []string{"tasks", "cancel", "usage", "logger", "storage"}; !reflect.DeepEqual(steps, want) {
		t.Fatalf("cleanup steps = %v, want %v", steps, want)
	}
}

func TestAppCloseWithoutResources(t *testing.T) {
	if err := (&App{}).Close(); err != nil {
		t.Fatalf("Close() error = %v, want nil", err)
	}
}
