package service

import (
	"context"
	"io"
	"time"
)

type mediaObjectInfo struct {
	SizeBytes int64
	SHA256    string
}

// mediaObjectStore is the internal seam between media lifecycle rules and
// object storage. Callers never need bucket, endpoint, or signing details.
type mediaObjectStore interface {
	PutFile(context.Context, string, string, string, string) error
	Get(context.Context, string) (io.ReadCloser, error)
	Head(context.Context, string) (mediaObjectInfo, error)
	PresignGet(context.Context, string, time.Duration) (string, error)
	PresignHead(context.Context, string, time.Duration) (string, error)
	PresignDownload(context.Context, string, time.Duration, string) (string, error)
	Delete(context.Context, string) error
	Health(context.Context) error
}
