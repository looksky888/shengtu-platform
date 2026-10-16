package app

import (
	"context"
	"sync"
	"time"
)

const (
	defaultMailboxSchedulerBatchSize = 1
	defaultMailboxSchedulerInterval  = 60 * time.Minute
	defaultMailboxSchedulerTarget    = 750
	mailboxSchedulerAppleQuota       = 20
	mailboxSchedulerICloudQuota      = 5
	maxMailboxSchedulerBatchSize     = 200
	maxMailboxSchedulerEvents        = 200
)

var defaultMailboxSchedulerRoundInterval = 5 * time.Second

type mailboxSchedulerConfig struct {
	AccountIDs    []string
	Label         string
	Note          string
	CreateChannel mailboxCreateChannel
	BatchSize     int
	Interval      time.Duration
	RoundInterval time.Duration
}

type mailboxSchedulerJob struct {
	mu          sync.Mutex
	cancel      context.CancelFunc
	nextEventID int64
	state       mailboxSchedulerState
	events      []mailboxSchedulerEvent
}

type mailboxSchedulerState struct {
	Running              bool
	OwnerID              string
	Owner                string
	AccountID            string
	AccountIDs           []string
	Label                string
	Note                 string
	CreateChannel        mailboxCreateChannel
	BatchSize            int
	TargetPerAccount     int
	IntervalSeconds      int
	RoundIntervalSeconds int
	Status               string
	BatchIndex           int
	Success              int
	Failed               int
	StartedAt            time.Time
	LastRunAt            time.Time
	NextRunAt            time.Time
	StoppedAt            time.Time
	LastError            string
}

type mailboxSchedulerEvent struct {
	ID        int64
	At        time.Time
	Type      string
	Message   string
	Batch     int
	MailboxID string
	Email     string
	Error     string
}

type publicMailboxScheduler struct {
	Running              bool                          `json:"running"`
	Owner                string                        `json:"owner,omitempty"`
	AccountID            string                        `json:"account_id,omitempty"`
	AccountIDs           []string                      `json:"account_ids,omitempty"`
	Label                string                        `json:"label,omitempty"`
	Note                 string                        `json:"note,omitempty"`
	CreateChannel        string                        `json:"create_channel,omitempty"`
	CreateChannelLabel   string                        `json:"create_channel_label,omitempty"`
	BatchSize            int                           `json:"batch_size"`
	TargetPerAccount     int                           `json:"target_per_account"`
	AppleAccountQuota    int                           `json:"apple_account_quota"`
	ICloudWebQuota       int                           `json:"icloud_web_quota"`
	IntervalSeconds      int                           `json:"interval_seconds"`
	IntervalMinutes      int                           `json:"interval_minutes"`
	RoundIntervalSeconds int                           `json:"round_interval_seconds"`
	Status               string                        `json:"status"`
	BatchIndex           int                           `json:"batch_index"`
	Success              int                           `json:"success"`
	Failed               int                           `json:"failed"`
	StartedAt            string                        `json:"started_at,omitempty"`
	LastRunAt            string                        `json:"last_run_at,omitempty"`
	NextRunAt            string                        `json:"next_run_at,omitempty"`
	StoppedAt            string                        `json:"stopped_at,omitempty"`
	LastError            string                        `json:"last_error,omitempty"`
	Events               []publicMailboxSchedulerEvent `json:"events"`
}

type publicMailboxSchedulerEvent struct {
	ID        int64  `json:"id"`
	At        string `json:"at"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	Batch     int    `json:"batch,omitempty"`
	MailboxID string `json:"mailbox_id,omitempty"`
	Email     string `json:"email,omitempty"`
	APIURL    string `json:"api_url,omitempty"`
	Error     string `json:"error,omitempty"`
}
