package util

import (
	"errors"
	"io"
)

var ErrReadLimitExceeded = errors.New("read limit exceeded")

// ReadAllLimited reads at most limit bytes and reports overflow instead of
// silently returning a truncated payload.
func ReadAllLimited(reader io.Reader, limit int64) ([]byte, error) {
	if reader == nil {
		return nil, nil
	}
	if limit < 0 {
		return nil, ErrReadLimitExceeded
	}
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, ErrReadLimitExceeded
	}
	return data, nil
}
