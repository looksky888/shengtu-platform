package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

type taskProgressContextKey struct{}

// TaskProgressSink receives account/task lifecycle updates during image generation.
type TaskProgressSink interface {
	Event(stage, message string, extra map[string]any)
	BindAccount(label, tokenHash string, switchCount int)
	SetProgress(percent int, stage, message string)
}

// WithTaskProgress attaches a progress sink to ctx so account acquire/stream can report.
func WithTaskProgress(ctx context.Context, sink TaskProgressSink) context.Context {
	if ctx == nil || sink == nil {
		return ctx
	}
	return context.WithValue(ctx, taskProgressContextKey{}, sink)
}

// TaskProgressFromContext returns the sink if present.
func TaskProgressFromContext(ctx context.Context) TaskProgressSink {
	if ctx == nil {
		return nil
	}
	sink, _ := ctx.Value(taskProgressContextKey{}).(TaskProgressSink)
	return sink
}

func reportTaskEvent(ctx context.Context, stage, message string, extra map[string]any) {
	if sink := TaskProgressFromContext(ctx); sink != nil {
		sink.Event(stage, message, extra)
	}
}

// ReportTaskEvent lets provider clients attach non-secret attempt evidence to
// the current creation task. Calls outside a task context are no-ops.
func ReportTaskEvent(ctx context.Context, stage, message string, extra map[string]any) {
	reportTaskEvent(ctx, stage, message, extra)
}

func reportTaskProgress(ctx context.Context, percent int, stage, message string) {
	if sink := TaskProgressFromContext(ctx); sink != nil {
		sink.SetProgress(percent, stage, message)
	}
}

func reportTaskAccount(ctx context.Context, label, tokenHash string, switchCount int) {
	if sink := TaskProgressFromContext(ctx); sink != nil {
		sink.BindAccount(label, tokenHash, switchCount)
	}
}

func shortTokenHash(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])[:12]
}
