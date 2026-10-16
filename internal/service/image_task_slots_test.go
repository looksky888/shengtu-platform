package service

import (
	"context"
	"testing"
	"time"
)

func TestReleaseImageSlotsBroadcastsAndRotatesNotification(t *testing.T) {
	svc := &ImageTaskService{
		runningByChannel: map[string]int{imageTaskChannelGPT: 1},
		slotChanged:      make(chan struct{}),
	}
	before := svc.slotChanged

	svc.releaseImageSlots(1, imageTaskChannelGPT)

	select {
	case <-before:
	default:
		t.Fatal("releaseImageSlots() did not notify waiters")
	}
	if svc.slotChanged == nil || svc.slotChanged == before {
		t.Fatal("releaseImageSlots() did not rotate notification channel")
	}
	if got := svc.runningByChannel[imageTaskChannelGPT]; got != 0 {
		t.Fatalf("running slots = %d, want 0", got)
	}
}

func TestAcquireImageSlotsWakesAfterRelease(t *testing.T) {
	svc := &ImageTaskService{
		concurrentLimit:  func() int { return 1 },
		runningByChannel: map[string]int{imageTaskChannelGPT: 1},
		slotChanged:      make(chan struct{}),
	}
	result := make(chan bool, 1)
	go func() {
		_, ok := svc.acquireImageSlots(context.Background(), 1, imageTaskChannelGPT)
		result <- ok
	}()

	time.Sleep(25 * time.Millisecond)
	svc.releaseImageSlots(1, imageTaskChannelGPT)

	select {
	case ok := <-result:
		if !ok {
			t.Fatal("acquireImageSlots() returned cancelled after release")
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("acquireImageSlots() did not wake promptly after release")
	}
	svc.releaseImageSlots(1, imageTaskChannelGPT)
}

func TestAcquireImageSlotsStopsOnContextCancellation(t *testing.T) {
	svc := &ImageTaskService{
		concurrentLimit:  func() int { return 1 },
		runningByChannel: map[string]int{imageTaskChannelGPT: 1},
		slotChanged:      make(chan struct{}),
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan bool, 1)
	go func() {
		_, ok := svc.acquireImageSlots(ctx, 1, imageTaskChannelGPT)
		result <- ok
	}()

	time.Sleep(25 * time.Millisecond)
	cancel()

	select {
	case ok := <-result:
		if ok {
			t.Fatal("acquireImageSlots() acquired a saturated slot after cancellation")
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("acquireImageSlots() did not stop promptly after cancellation")
	}
}

func TestAcquireImageSlotsDoesNotShareCapacityAcrossChannels(t *testing.T) {
	svc := &ImageTaskService{
		concurrentLimit:  func() int { return 1 },
		runningByChannel: map[string]int{imageTaskChannelGPT: 1},
		slotChanged:      make(chan struct{}),
	}
	result := make(chan bool, 1)
	go func() {
		_, ok := svc.acquireImageSlots(context.Background(), 1, "image_channel:relay-1", 1)
		result <- ok
	}()

	select {
	case ok := <-result:
		if !ok {
			t.Fatal("relay channel should not be blocked by a full GPT channel")
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("relay channel waited on unrelated GPT capacity")
	}
	svc.releaseImageSlots(1, "image_channel:relay-1")
}

func TestImageTaskSlotRequestMatchesActualExecutionMode(t *testing.T) {
	svc := &ImageTaskService{concurrentLimit: func() int { return 3 }}
	payload := map[string]any{"n": 4}
	if got := svc.imageTaskSlotRequest(payload, imageTaskChannelGPT); got != 1 {
		t.Fatalf("GPT slots = %d, want 1", got)
	}
	svc.imageParallelGeneration = func() bool { return false }
	if got := svc.imageTaskSlotRequest(payload, imageTaskChannelGrok); got != 1 {
		t.Fatalf("serial Grok slots = %d, want 1", got)
	}
	svc.imageParallelGeneration = func() bool { return true }
	if got := svc.imageTaskSlotRequest(payload, imageTaskChannelGrok); got != 3 {
		t.Fatalf("parallel Grok slots = %d, want clamped 3", got)
	}
}
