package service

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type imageTaskDeleteFailureBackend struct {
	storage.Backend
	documents      storage.JSONDocumentBackend
	mu             sync.Mutex
	failDeleteOnce bool
}

func (b *imageTaskDeleteFailureBackend) LoadJSONDocument(name string) (any, error) {
	return b.documents.LoadJSONDocument(name)
}

func (b *imageTaskDeleteFailureBackend) SaveJSONDocument(name string, value any) error {
	return b.documents.SaveJSONDocument(name, value)
}

func (b *imageTaskDeleteFailureBackend) DeleteJSONDocument(name string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.failDeleteOnce {
		b.failDeleteOnce = false
		return errors.New("forced image task delete failure")
	}
	return b.documents.DeleteJSONDocument(name)
}

// TestImageTaskCapacityTiers is a deterministic scheduler capacity test. It
// does not claim upstream throughput; it verifies that local worker/queue
// control completes the target tiers without exceeding the configured worker
// ceiling or leaking task state.
func TestImageTaskCapacityTiers(t *testing.T) {
	for _, concurrency := range []int{3, 5, 8, 10, 16} {
		t.Run(fmt.Sprintf("workers_%d", concurrency), func(t *testing.T) {
			var mu sync.Mutex
			active, maxActive := 0, 0
			started := make(chan struct{}, concurrency)
			release := make(chan struct{})
			handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
				mu.Lock()
				active++
				if active > maxActive {
					maxActive = active
				}
				mu.Unlock()
				started <- struct{}{}
				<-release
				mu.Lock()
				active--
				mu.Unlock()
				return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
			}
			svc := NewImageTaskService(t.TempDir()+"/tasks.json", handler, handler, handler, func() int { return 30 }, func() int { return concurrency })
			svc.SetWorkerPoolConfig(concurrency, concurrency*4)
			t.Cleanup(func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := svc.Close(ctx); err != nil {
					t.Errorf("Close() error: %v", err)
				}
			})
			identity := Identity{ID: "capacity-user", Role: AuthRoleAdmin}
			for i := 0; i < concurrency*2; i++ {
				id := fmt.Sprintf("task-%02d", i)
				if _, err := svc.SubmitGeneration(context.Background(), identity, id, "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
					t.Fatalf("submit %s: %v", id, err)
				}
			}
			for i := 0; i < concurrency; i++ {
				select {
				case <-started:
				case <-time.After(5 * time.Second):
					t.Fatalf("only %d/%d workers reached handler", i, concurrency)
				}
			}
			close(release)
			for i := 0; i < concurrency*2; i++ {
				waitForTaskStatus(t, svc, identity, fmt.Sprintf("task-%02d", i), TaskStatusSuccess)
			}
			mu.Lock()
			gotMax := maxActive
			mu.Unlock()
			if gotMax != concurrency {
				t.Fatalf("max handler concurrency = %d, want %d", gotMax, concurrency)
			}
		})
	}
}

func TestImageTaskQueueOverflowPersistsTerminalStateWhenRollbackDeleteFails(t *testing.T) {
	base := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	backend := &imageTaskDeleteFailureBackend{Backend: base, documents: base}
	started := make(chan struct{})
	release := make(chan struct{})
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		select {
		case <-started:
		default:
			close(started)
		}
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewStoredImageTaskService(filepath.Join(t.TempDir(), "tasks.json"), backend, handler, handler, handler, func() int { return 30 }, func() int { return 1 })
	svc.SetWorkerPoolConfig(1, 1)
	t.Cleanup(func() {
		close(release)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = svc.Close(ctx)
	})
	identity := Identity{ID: "overflow-user", Role: AuthRoleAdmin}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "running", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
		t.Fatalf("submit running: %v", err)
	}
	<-started
	if _, err := svc.SubmitGeneration(context.Background(), identity, "queued", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
		t.Fatalf("submit queued: %v", err)
	}
	backend.mu.Lock()
	backend.failDeleteOnce = true
	backend.mu.Unlock()
	if _, err := svc.SubmitGeneration(context.Background(), identity, "overflow", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err == nil {
		t.Fatal("queue overflow error = nil")
	}
	task, ok := svc.FindTaskTyped(identity, "overflow")
	if !ok {
		t.Fatal("overflow task missing after rollback persistence failure")
	}
	if task.Status != TaskStatusError || task.Error != "图片任务队列已满，请稍后重试" {
		t.Fatalf("overflow task = %#v", task)
	}
}
