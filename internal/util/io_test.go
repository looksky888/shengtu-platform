package util

import (
	"errors"
	"strings"
	"testing"
)

func TestReadAllLimitedAcceptsExactLimit(t *testing.T) {
	data, err := ReadAllLimited(strings.NewReader("abcd"), 4)
	if err != nil || string(data) != "abcd" {
		t.Fatalf("data=%q err=%v", data, err)
	}
}

func TestReadAllLimitedRejectsOverflow(t *testing.T) {
	data, err := ReadAllLimited(strings.NewReader("abcde"), 4)
	if !errors.Is(err, ErrReadLimitExceeded) || data != nil {
		t.Fatalf("data=%q err=%v", data, err)
	}
}
