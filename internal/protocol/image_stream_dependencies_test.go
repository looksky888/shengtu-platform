package protocol

import (
	"context"
	"testing"

	"chatgpt2api/internal/util"
)

func TestStreamImageOutputsWithPoolRejectsMissingAccountService(t *testing.T) {
	outputs, errors := (&Engine{}).StreamImageOutputsWithPool(context.Background(), ConversationRequest{
		Model: util.ImageModelGPT,
		N:     1,
	})
	for range outputs {
		t.Fatal("unexpected image output")
	}
	if err := <-errors; err == nil {
		t.Fatal("missing account service error = nil")
	}
}
