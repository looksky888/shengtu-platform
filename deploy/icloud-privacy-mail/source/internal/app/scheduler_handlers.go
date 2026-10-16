package app

import (
	"context"
	"net/http"
	"strings"
	"time"
)

func (s *Server) handleMailboxSchedulerStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"scheduler": s.publicMailboxScheduler(r),
	})
}

func (s *Server) handleStartMailboxScheduler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID            string   `json:"account_id"`
		AccountIDs           []string `json:"account_ids"`
		Label                string   `json:"label"`
		Note                 string   `json:"note"`
		CreateChannel        string   `json:"create_channel"`
		BatchSize            int      `json:"batch_size"`
		IntervalMinutes      int      `json:"interval_minutes"`
		IntervalSeconds      int      `json:"interval_seconds"`
		RoundIntervalSeconds int      `json:"round_interval_seconds"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	ownerID := requestOwnerID(r, s.store)
	if ownerID == "" && !isInternalICloudRequest(r) {
		writeError(w, http.StatusUnauthorized, errCode("auth_required", "请先登录账号", false))
		return
	}
	accountIDs := normalizeAccountIDSelection(payload.AccountID, payload.AccountIDs)
	for _, accountID := range accountIDs {
		if !s.canAccessAccountIDForOwner(ownerID, accountID) {
			writeError(w, http.StatusNotFound, errCode("account_not_found", "账号不存在", false))
			return
		}
	}
	if len(s.sessionsForOwnerAccounts(ownerID, accountIDs)) == 0 {
		writeError(w, http.StatusBadRequest, errCode("icloud_session_missing", "未找到可用于创建的 iCloud 登录态，请检查参与账号 ID 或先保存登录态", true))
		return
	}

	cfg := mailboxSchedulerConfig{
		AccountIDs:    accountIDs,
		Label:         strings.TrimSpace(payload.Label),
		Note:          strings.TrimSpace(payload.Note),
		CreateChannel: normalizeMailboxCreateChannel(mailboxCreateChannel(strings.ToLower(strings.TrimSpace(payload.CreateChannel)))),
		BatchSize:     defaultMailboxSchedulerBatchSize,
		Interval:      defaultMailboxSchedulerInterval,
		RoundInterval: defaultMailboxSchedulerRoundInterval,
	}
	if payload.IntervalSeconds > 0 {
		cfg.Interval = time.Duration(payload.IntervalSeconds) * time.Second
	} else if payload.IntervalMinutes > 0 {
		cfg.Interval = time.Duration(payload.IntervalMinutes) * time.Minute
	}
	if cfg.Interval < time.Second {
		cfg.Interval = time.Second
	}
	if payload.RoundIntervalSeconds > 0 {
		cfg.RoundInterval = time.Duration(payload.RoundIntervalSeconds) * time.Second
		if cfg.RoundInterval < time.Second {
			cfg.RoundInterval = time.Second
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	job := &mailboxSchedulerJob{
		cancel: cancel,
		state: mailboxSchedulerState{
			Running:              true,
			OwnerID:              ownerID,
			Owner:                s.ownerName(ownerID),
			AccountID:            strings.Join(cfg.AccountIDs, ","),
			AccountIDs:           append([]string(nil), cfg.AccountIDs...),
			Label:                cfg.Label,
			Note:                 cfg.Note,
			CreateChannel:        cfg.CreateChannel,
			BatchSize:            cfg.BatchSize,
			TargetPerAccount:     defaultMailboxSchedulerTarget,
			IntervalSeconds:      int(cfg.Interval.Round(time.Second).Seconds()),
			RoundIntervalSeconds: int(cfg.RoundInterval.Round(time.Second).Seconds()),
			Status:               "running",
			StartedAt:            time.Now(),
		},
	}
	job.addEventLocked("started", "定时创建已启动", 0, Mailbox{}, nil)

	s.schedulerMu.Lock()
	if old := s.mailboxSchedulers[ownerID]; old != nil && old.running() {
		s.schedulerMu.Unlock()
		cancel()
		writeError(w, http.StatusConflict, errCode("scheduler_running", "定时创建已经在运行，请先停止后再启动", false))
		return
	}
	s.mailboxSchedulers[ownerID] = job
	s.schedulerMu.Unlock()

	go s.runMailboxScheduler(ctx, ownerID, job, cfg)
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"scheduler": s.publicMailboxScheduler(r),
	})
}

func (s *Server) handleStopMailboxScheduler(w http.ResponseWriter, r *http.Request) {
	ownerID := requestOwnerID(r, s.store)
	if ownerID == "" && !isInternalICloudRequest(r) {
		writeError(w, http.StatusUnauthorized, errCode("auth_required", "请先登录账号", false))
		return
	}
	job := s.mailboxScheduler(ownerID)
	if job == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"success":   true,
			"scheduler": s.publicMailboxScheduler(r),
		})
		return
	}
	job.stop("已手动停止定时创建")
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"scheduler": s.publicMailboxScheduler(r),
	})
}

func (s *Server) handleClearMailboxSchedulerLogs(w http.ResponseWriter, r *http.Request) {
	ownerID := requestOwnerID(r, s.store)
	if ownerID == "" && !isInternalICloudRequest(r) {
		writeError(w, http.StatusUnauthorized, errCode("auth_required", "请先登录账号", false))
		return
	}
	if job := s.mailboxScheduler(ownerID); job != nil {
		job.clearEvents()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"message":   "定时创建记录已清除",
		"scheduler": s.publicMailboxScheduler(r),
	})
}
