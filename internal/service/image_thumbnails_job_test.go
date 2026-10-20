package service

import (
	"sync/atomic"
	"testing"
	"time"
)

// TestWithThumbnailJobClosesJobAfterPanic pins the deadlock fix: a panic inside
// the job used to leave the entry in thumbnailJobs with `done` unclosed, so every
// later caller for the same image blocked on <-done forever.
func TestWithThumbnailJobClosesJobAfterPanic(t *testing.T) {
	svc := &ImageService{}
	func() {
		defer func() { _ = recover() }()
		svc.withThumbnailJob("a.jpg", func() map[string]any { panic("boom") })
	}()

	svc.thumbnailMu.Lock()
	remaining := len(svc.thumbnailJobs)
	svc.thumbnailMu.Unlock()
	if remaining != 0 {
		t.Fatalf("thumbnailJobs still holds %d entry/entries after a panic", remaining)
	}

	done := make(chan map[string]any, 1)
	go func() {
		done <- svc.withThumbnailJob("a.jpg", func() map[string]any {
			return map[string]any{"thumbnail_rel": "t.jpg"}
		})
	}()
	select {
	case result := <-done:
		if result["thumbnail_rel"] != "t.jpg" {
			t.Fatalf("result = %#v", result)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("second call blocked: the job entry was not cleaned up after a panic")
	}
}

// TestWithThumbnailJobDeduplicatesConcurrentWork keeps the dedup contract: callers
// that overlap must share one generation, not each do their own.
func TestWithThumbnailJobDeduplicatesConcurrentWork(t *testing.T) {
	svc := &ImageService{}
	var calls int32
	started := make(chan struct{})
	release := make(chan struct{})
	run := func() map[string]any {
		atomic.AddInt32(&calls, 1)
		close(started)
		<-release
		return map[string]any{"thumbnail_rel": "t.jpg"}
	}

	first := make(chan map[string]any, 1)
	go func() { first <- svc.withThumbnailJob("b.jpg", run) }()
	<-started

	second := make(chan map[string]any, 1)
	go func() { second <- svc.withThumbnailJob("b.jpg", run) }()
	// Let the second caller attach to the in-flight job before releasing the first.
	time.Sleep(100 * time.Millisecond)
	close(release)

	for index, ch := range []chan map[string]any{first, second} {
		select {
		case result := <-ch:
			if result["thumbnail_rel"] != "t.jpg" {
				t.Fatalf("caller %d result = %#v", index, result)
			}
		case <-time.After(3 * time.Second):
			t.Fatalf("caller %d did not return", index)
		}
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("run executed %d times, want 1 shared generation", got)
	}
}
