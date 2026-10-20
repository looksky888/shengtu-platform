package service

import (
	"bytes"
	"log"
	"strings"
	"testing"
)

func TestReleaseImageSlotsClampsOverReleaseAndReportsIt(t *testing.T) {
	original := log.Writer()
	var logged bytes.Buffer
	log.SetOutput(&logged)
	t.Cleanup(func() { log.SetOutput(original) })

	cases := []struct {
		name       string
		held       int
		released   int
		wantHeld   int
		wantLogged bool
	}{
		{name: "exact release", held: 2, released: 2, wantHeld: 0},
		{name: "partial release", held: 3, released: 1, wantHeld: 2},
		{name: "over release clamps to zero", held: 1, released: 3, wantHeld: 0, wantLogged: true},
		{name: "release without holders", held: 0, released: 1, wantHeld: 0, wantLogged: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			logged.Reset()
			svc := &ImageTaskService{
				runningByChannel: map[string]int{imageTaskChannelGPT: tc.held},
				slotChanged:      make(chan struct{}),
			}
			svc.releaseImageSlots(tc.released, imageTaskChannelGPT)
			if got := svc.runningByChannel[imageTaskChannelGPT]; got != tc.wantHeld {
				t.Fatalf("running slots = %d, want %d", got, tc.wantHeld)
			}
			if reported := strings.Contains(logged.String(), "over-released"); reported != tc.wantLogged {
				t.Fatalf("over-release reported = %v, want %v (log %q)", reported, tc.wantLogged, logged.String())
			}
		})
	}
}
