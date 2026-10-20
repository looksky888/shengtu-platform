package backend

import (
	"encoding/json"
	"errors"
	"net/http"
)

// ErrAutoImageModelNotFound is emitted only by the actual picture_v2 POST,
// never by bootstrap, prepare, uploads, polling, SSE bodies or other models.
var ErrAutoImageModelNotFound = errors.New("auto image conversation model temporarily unavailable")

func isAutoImageModelNotFound(status int, actualModel string, body []byte) bool {
	if status != http.StatusNotFound || actualModel != "auto" {
		return false
	}
	var payload struct {
		Detail json.RawMessage `json:"detail"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return false
	}
	var detail string
	return json.Unmarshal(payload.Detail, &detail) == nil && detail == "Model not found"
}
