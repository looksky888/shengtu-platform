package protocol

import (
	"fmt"
	"testing"
)

// TestStreamImageResponseEmitsEveryGeneratedImage pins the fix for the streaming
// Responses path, which used to send only items[0] and then response.completed,
// silently dropping every other image the caller had already paid for.
func TestStreamImageResponseEmitsEveryGeneratedImage(t *testing.T) {
	outputs := make(chan ImageOutput, MaxImageCount)
	for i := 0; i < 3; i++ {
		outputs <- ImageOutput{
			Kind:    "result",
			Created: 1700000000,
			Data:    []map[string]any{{"b64_json": fmt.Sprintf("payload-%d", i)}},
		}
	}
	close(outputs)

	out, errCh := StreamImageResponse(outputs, "a cat", "gpt-image-2.5-flare")

	doneIndexes := []int{}
	addedIndexes := []int{}
	ids := []string{}
	var response map[string]any
	for event := range out {
		switch event["type"] {
		case "response.output_item.added":
			addedIndexes = append(addedIndexes, event["output_index"].(int))
		case "response.output_item.done":
			doneIndexes = append(doneIndexes, event["output_index"].(int))
			item := event["item"].(map[string]any)
			ids = append(ids, item["id"].(string))
		case "response.completed":
			response = event["response"].(map[string]any)
		}
	}
	if err := <-errCh; err != nil {
		t.Fatalf("stream error = %v", err)
	}
	if response == nil {
		t.Fatal("no response.completed event")
	}
	output, _ := response["output"].([]map[string]any)
	if len(output) != 3 {
		t.Fatalf("response.completed carried %d item(s), want all 3", len(output))
	}
	if len(addedIndexes) != 3 || len(doneIndexes) != 3 {
		t.Fatalf("added=%v done=%v, want 3 of each", addedIndexes, doneIndexes)
	}
	seen := map[int]bool{}
	for i, index := range doneIndexes {
		if index != i {
			t.Fatalf("output_index sequence = %v, want 0,1,2", doneIndexes)
		}
		if seen[index] {
			t.Fatalf("duplicate output_index %d", index)
		}
		seen[index] = true
	}
	unique := map[string]bool{}
	for _, id := range ids {
		if id == "" || unique[id] {
			t.Fatalf("item ids must be unique and non-empty, got %v", ids)
		}
		unique[id] = true
	}
}

func TestStreamImageResponseReportsFailureWhenNoImageArrives(t *testing.T) {
	outputs := make(chan ImageOutput)
	close(outputs)
	out, errCh := StreamImageResponse(outputs, "a cat", "m")
	for range out {
	}
	if err := <-errCh; err == nil {
		t.Fatal("expected an error when the stream produced no image")
	}
}
