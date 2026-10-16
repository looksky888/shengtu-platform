package service

import (
	"sync"
	"time"
)

const defaultUpstreamClearanceTarget = "https://chatgpt.com/"

type UpstreamClearanceCookie struct {
	Name   string
	Value  string
	Domain string
	Path   string
}

type UpstreamClearanceBundle struct {
	TargetHost string
	ProxyURL   string
	UserAgent  string
	Cookies    []UpstreamClearanceCookie
	CreatedAt  time.Time
	ExpiresAt  time.Time
}

type upstreamClearanceFailureState struct {
	err      error
	failedAt time.Time
}

// upstreamClearanceFlightState coalesces concurrent refreshes for the same
// (target host, proxy) key without holding the process-wide mutex during the
// network request. Waiting callers can still cancel their own context.
type upstreamClearanceFlightState struct {
	done       chan struct{}
	bundle     *UpstreamClearanceBundle
	err        error
	generation uint64
}

var (
	upstreamClearanceMu         sync.Mutex
	upstreamClearanceCache      = map[string]*UpstreamClearanceBundle{}
	upstreamClearanceFlight     = map[string]*upstreamClearanceFlightState{}
	upstreamClearanceFailures   = map[string]upstreamClearanceFailureState{}
	upstreamClearanceGeneration uint64
)

const upstreamClearanceFailureBackoff = 30 * time.Second
