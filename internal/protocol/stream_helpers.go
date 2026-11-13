package protocol

import "context"

// sendChan writes value to ch unless ctx is already or becomes canceled.
func sendChan[T any](ctx context.Context, ch chan<- T, value T) bool {
	if ctx == nil {
		ch <- value
		return true
	}
	select {
	case ch <- value:
		return true
	case <-ctx.Done():
		return false
	}
}
