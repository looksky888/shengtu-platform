package httpapi

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/sidecar"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const overviewGrokRuntimeTimeout = 1500 * time.Millisecond

type adminOverviewResponse struct {
	Period        string                     `json:"period"`
	Capability    string                     `json:"capability"`
	Channel       string                     `json:"channel"`
	Model         string                     `json:"model"`
	GeneratedAt   string                     `json:"generated_at"`
	Tasks         adminOverviewTasks         `json:"tasks"`
	Series        []adminOverviewSeriesPoint `json:"series"`
	Models        []adminOverviewModelRow    `json:"models"`
	Errors        []adminOverviewErrorRow    `json:"errors"`
	FilterOptions adminOverviewFilterOptions `json:"filter_options"`
	Users         adminOverviewUsers         `json:"users"`
	Payments      adminOverviewPayments      `json:"payments"`
	Pools         adminOverviewPools         `json:"pools"`
}

type adminOverviewTasks struct {
	Total         int     `json:"total"`
	Succeeded     int     `json:"succeeded"`
	Failed        int     `json:"failed"`
	Running       int     `json:"running"`
	Queued        int     `json:"queued"`
	Finished      int     `json:"finished"`
	SuccessRate   float64 `json:"success_rate"`
	TotalImages   int     `json:"total_images"`
	TotalVideos   int     `json:"total_videos"`
	AvgDurationMS int64   `json:"avg_duration_ms"`
}

type adminOverviewSeriesPoint struct {
	Bucket    string `json:"bucket"`
	Label     string `json:"label"`
	Total     int    `json:"total"`
	Succeeded int    `json:"succeeded"`
	Failed    int    `json:"failed"`
	Images    int    `json:"images"`
	Videos    int    `json:"videos"`
}

type adminOverviewModelRow struct {
	Model         string  `json:"model"`
	ChannelID     string  `json:"channel_id"`
	ChannelName   string  `json:"channel_name"`
	Capability    string  `json:"capability"`
	Total         int     `json:"total"`
	Succeeded     int     `json:"succeeded"`
	Failed        int     `json:"failed"`
	SuccessRate   float64 `json:"success_rate"`
	AvgDurationMS int64   `json:"avg_duration_ms"`
}

type adminOverviewErrorRow struct {
	Reason      string `json:"reason"`
	Model       string `json:"model"`
	ChannelName string `json:"channel_name"`
	Count       int    `json:"count"`
	LastSeenAt  string `json:"last_seen_at"`
}

type adminOverviewFilterOptions struct {
	Channels []adminOverviewChannelOption `json:"channels"`
	Models   []string                     `json:"models"`
}

type adminOverviewChannelOption struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

type adminOverviewUsers struct {
	TotalUsers          int `json:"total_users"`
	ActiveUsers         int `json:"active_users"`
	PaidUsers           int `json:"paid_users"`
	TotalCreditsBalance int `json:"total_credits_balance"`
}

type adminOverviewPayments struct {
	PeriodAmountFen        int64                         `json:"period_amount_fen"`
	PeriodSucceededOrders  int                           `json:"period_succeeded_orders"`
	PeriodTotalOrders      int                           `json:"period_total_orders"`
	TodayAmountFen         int64                         `json:"today_amount_fen"`
	Last7dAmountFen        int64                         `json:"last_7d_amount_fen"`
	Last30dAmountFen       int64                         `json:"last_30d_amount_fen"`
	AllTimeAmountFen       int64                         `json:"all_time_amount_fen"`
	AllTimeSucceededOrders int                           `json:"all_time_succeeded_orders"`
	RechargeEnabled        bool                          `json:"recharge_enabled"`
	ChannelBreakdown       []adminOverviewPaymentChannel `json:"channel_breakdown"`
}

type adminOverviewPaymentChannel struct {
	Channel   string `json:"channel"`
	AmountFen int64  `json:"amount_fen"`
	Orders    int    `json:"orders"`
}

type adminOverviewPools struct {
	OpenAI        adminOverviewOpenAIPool `json:"openai"`
	Grok          adminOverviewGrokPool   `json:"grok"`
	ProxyEnabled  bool                    `json:"proxy_enabled"`
	ClearanceMode string                  `json:"clearance_mode"`
}

type adminOverviewOpenAIPool struct {
	Total       int `json:"total"`
	Available   int `json:"available"`
	Cooling     int `json:"cooling"`
	Quarantined int `json:"quarantined"`
	Disabled    int `json:"disabled"`
}

type adminOverviewGrokPool struct {
	Total            int `json:"total"`
	Available        int `json:"available"`
	Cooling          int `json:"cooling"`
	Quarantined      int `json:"quarantined"`
	Disabled         int `json:"disabled"`
	TheoreticalSlots int `json:"theoretical_slots"`
}

type overviewDayRetainedCounts struct {
	successImgTasks int
	failedImgTasks  int
	successImages   int
	successVidTasks int
	failedVidTasks  int
	successVideos   int
}

type overviewModelAgg struct {
	row           adminOverviewModelRow
	durationSumMS int64
	durationCount int64
}

type overviewErrorAgg struct {
	row      adminOverviewErrorRow
	seenTime time.Time
}

func (a *App) handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}

	loc := util.ChinaLocation()
	now := time.Now().In(loc)

	period := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("period")))
	if period == "" || period == "day" {
		period = "today"
	}
	switch period {
	case "today", "7d", "30d":
	default:
		util.WriteError(w, http.StatusBadRequest, "统计周期仅支持 today、7d 或 30d")
		return
	}

	capability := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("capability")))
	if capability == "" {
		capability = "all"
	}
	switch capability {
	case "all", "image", "video":
	default:
		util.WriteError(w, http.StatusBadRequest, "能力筛选仅支持 all、image 或 video")
		return
	}

	channelFilter := strings.TrimSpace(r.URL.Query().Get("channel"))
	modelFilter := strings.TrimSpace(r.URL.Query().Get("model"))

	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	end := todayStart.AddDate(0, 0, 1)
	start := todayStart

	var series []adminOverviewSeriesPoint
	bucketIndexByKey := make(map[string]int)
	switch period {
	case "today":
		series = make([]adminOverviewSeriesPoint, 24)
		for hour := 0; hour < 24; hour++ {
			slot := todayStart.Add(time.Duration(hour) * time.Hour)
			key := slot.Format("2006-01-02T15:00")
			series[hour] = adminOverviewSeriesPoint{
				Bucket: key,
				Label:  slot.Format("15:00"),
			}
			bucketIndexByKey[key] = hour
		}
	case "7d":
		start = todayStart.AddDate(0, 0, -6)
		series = make([]adminOverviewSeriesPoint, 7)
		for idx := 0; idx < 7; idx++ {
			day := start.AddDate(0, 0, idx)
			key := day.Format("2006-01-02")
			series[idx] = adminOverviewSeriesPoint{
				Bucket: key,
				Label:  day.Format("01-02"),
			}
			bucketIndexByKey[key] = idx
		}
	case "30d":
		start = todayStart.AddDate(0, 0, -29)
		series = make([]adminOverviewSeriesPoint, 30)
		for idx := 0; idx < 30; idx++ {
			day := start.AddDate(0, 0, idx)
			key := day.Format("2006-01-02")
			series[idx] = adminOverviewSeriesPoint{
				Bucket: key,
				Label:  day.Format("01-02"),
			}
			bucketIndexByKey[key] = idx
		}
	}

	channelByID, modelByID, defaultChannelForModel, poolChannel, grokChannel, filterOptions, knownModels := a.buildOverviewChannelCatalog()

	var rawTasks []service.ImageTask
	var ledgerDays map[string]service.OverviewLedgerDay
	if a.tasks != nil {
		rawTasks, ledgerDays = a.tasks.OverviewSnapshot()
	}

	var taskStats adminOverviewTasks
	var totalDurationSumMS int64
	var totalDurationCount int64

	seenTaskIDs := make(map[string]struct{}, len(rawTasks))
	retainedByDay := make(map[string]*overviewDayRetainedCounts)
	getDayRetained := func(dayKey string) *overviewDayRetainedCounts {
		if existing, ok := retainedByDay[dayKey]; ok {
			return existing
		}
		created := &overviewDayRetainedCounts{}
		retainedByDay[dayKey] = created
		return created
	}

	modelAggs := make(map[string]*overviewModelAgg)
	errorAggs := make(map[string]*overviewErrorAgg)

	bucketIdxForTime := func(ts time.Time) (int, bool) {
		if period == "today" {
			idx, ok := bucketIndexByKey[ts.Format("2006-01-02T15:00")]
			return idx, ok
		}
		idx, ok := bucketIndexByKey[ts.Format("2006-01-02")]
		return idx, ok
	}

	for i := range rawTasks {
		task := &rawTasks[i]
		if taskID := strings.TrimSpace(task.ID); taskID != "" {
			seenTaskIDs[taskID] = struct{}{}
		}
		capType := service.ClassifyTaskCapability(task.Mode)
		if capType == "" {
			continue
		}

		modelName := overviewTaskModelName(task, capType)
		if modelName != "" {
			knownModels[modelName] = struct{}{}
		}
		chID, chName := resolveOverviewTaskChannel(task, capType, modelName, channelByID, modelByID, defaultChannelForModel, poolChannel, grokChannel)

		ts := resolveOverviewTaskTimestamp(task, loc)
		if ts.IsZero() || ts.Before(start) || !ts.Before(end) {
			continue
		}

		status := strings.ToLower(strings.TrimSpace(task.Status))
		outputs := overviewTaskSuccessOutputs(task, status)

		// Track retained terminal counts per day before channel/model filter so ledger
		// reconciliation (used only when channel=="" && model=="") never double-counts.
		dayRetained := getDayRetained(ts.Format("2006-01-02"))
		switch status {
		case service.TaskStatusSuccess:
			if capType == "video" {
				dayRetained.successVidTasks++
				dayRetained.successVideos += outputs
			} else {
				dayRetained.successImgTasks++
				dayRetained.successImages += outputs
			}
		case service.TaskStatusError:
			if capType == "video" {
				dayRetained.failedVidTasks++
				dayRetained.successVideos += outputs
			} else {
				dayRetained.failedImgTasks++
				dayRetained.successImages += outputs
			}
		}

		if capability != "all" && capType != capability {
			continue
		}
		if channelFilter != "" && !strings.EqualFold(chID, channelFilter) {
			continue
		}
		if modelFilter != "" && !strings.EqualFold(modelName, modelFilter) {
			continue
		}

		taskStats.Total++
		durMS, hasDur := overviewTaskDurationMS(task, loc)

		modelKey := capType + "\x00" + chID + "\x00" + modelName
		mAgg, exists := modelAggs[modelKey]
		if !exists {
			mAgg = &overviewModelAgg{
				row: adminOverviewModelRow{
					Model:       modelName,
					ChannelID:   chID,
					ChannelName: chName,
					Capability:  capType,
				},
			}
			modelAggs[modelKey] = mAgg
		}
		mAgg.row.Total++

		bIdx, hasBucket := bucketIdxForTime(ts)
		if hasBucket {
			series[bIdx].Total++
		}

		switch status {
		case service.TaskStatusSuccess:
			taskStats.Succeeded++
			taskStats.Finished++
			mAgg.row.Succeeded++
			if hasBucket {
				series[bIdx].Succeeded++
			}
			if capType == "video" {
				taskStats.TotalVideos += outputs
				if hasBucket {
					series[bIdx].Videos += outputs
				}
			} else {
				taskStats.TotalImages += outputs
				if hasBucket {
					series[bIdx].Images += outputs
				}
			}
			if hasDur {
				totalDurationSumMS += durMS
				totalDurationCount++
				mAgg.durationSumMS += durMS
				mAgg.durationCount++
			}
		case service.TaskStatusError:
			taskStats.Failed++
			taskStats.Finished++
			mAgg.row.Failed++
			if hasBucket {
				series[bIdx].Failed++
			}
			if outputs > 0 {
				if capType == "video" {
					taskStats.TotalVideos += outputs
					if hasBucket {
						series[bIdx].Videos += outputs
					}
				} else {
					taskStats.TotalImages += outputs
					if hasBucket {
						series[bIdx].Images += outputs
					}
				}
			}
			if hasDur {
				totalDurationSumMS += durMS
				totalDurationCount++
				mAgg.durationSumMS += durMS
				mAgg.durationCount++
			}
			reason := cleanOverviewErrorReason(task.Error, task.ErrorCode)
			errKey := reason + "\x00" + modelName + "\x00" + chName
			eAgg, ok := errorAggs[errKey]
			if !ok {
				eAgg = &overviewErrorAgg{
					row: adminOverviewErrorRow{
						Reason:      reason,
						Model:       modelName,
						ChannelName: chName,
						Count:       0,
						LastSeenAt:  ts.Format(time.RFC3339),
					},
					seenTime: ts,
				}
				errorAggs[errKey] = eAgg
			}
			eAgg.row.Count++
			if ts.After(eAgg.seenTime) {
				eAgg.seenTime = ts
				eAgg.row.LastSeenAt = ts.Format(time.RFC3339)
			}
		case service.TaskStatusRunning:
			taskStats.Running++
		case service.TaskStatusQueued:
			taskStats.Queued++
		case service.TaskStatusCancelled:
			taskStats.Finished++
		}
	}

	// Include persisted VideoAssetService records whose ImageTask entry is no longer retained.
	if a.videos != nil {
		for _, asset := range a.videos.List(service.VideoAssetScope{Kind: service.VideoAssetScopeAll}) {
			taskID := strings.TrimSpace(asset.TaskID)
			if taskID != "" {
				if _, ok := seenTaskIDs[taskID]; ok {
					continue
				}
			}
			ts := parseOverviewTime(asset.CreatedAt, loc)
			if ts.IsZero() || ts.Before(start) || !ts.Before(end) {
				continue
			}
			modelName := strings.TrimSpace(asset.Model)
			if modelName == "" {
				modelName = "grok-imagine-1.0-video"
			}
			knownModels[modelName] = struct{}{}

			dayRetained := getDayRetained(ts.Format("2006-01-02"))
			dayRetained.successVidTasks++
			dayRetained.successVideos++

			if capability != "all" && capability != "video" {
				continue
			}
			if channelFilter != "" && !strings.EqualFold(grokChannel.ID, channelFilter) {
				continue
			}
			if modelFilter != "" && !strings.EqualFold(modelName, modelFilter) {
				continue
			}

			taskStats.Total++
			taskStats.Succeeded++
			taskStats.Finished++
			taskStats.TotalVideos++
			if bIdx, ok := bucketIdxForTime(ts); ok {
				series[bIdx].Total++
				series[bIdx].Succeeded++
				series[bIdx].Videos++
			}
			modelKey := "video\x00" + grokChannel.ID + "\x00" + modelName
			mAgg, exists := modelAggs[modelKey]
			if !exists {
				mAgg = &overviewModelAgg{
					row: adminOverviewModelRow{
						Model:       modelName,
						ChannelID:   grokChannel.ID,
						ChannelName: grokChannel.Name,
						Capability:  "video",
					},
				}
				modelAggs[modelKey] = mAgg
			}
			mAgg.row.Total++
			mAgg.row.Succeeded++
		}
	}

	// Reconcile daily ledger deltas when unfiltered by channel/model so cleared or pruned
	// historical tasks remain represented in tasks and series across today / 7d / 30d.
	if channelFilter == "" && modelFilter == "" && len(ledgerDays) > 0 {
		for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
			dayKey := d.Format("2006-01-02")
			ledger, ok := ledgerDays[dayKey]
			if !ok {
				continue
			}
			ret := getDayRetained(dayKey)
			bIdx := -1
			if period == "today" {
				bIdx = now.Hour()
				if bIdx < 0 || bIdx >= len(series) {
					bIdx = 0
				}
			} else if idx, exists := bucketIndexByKey[dayKey]; exists {
				bIdx = idx
			}

			if capability == "all" || capability == "image" {
				extraSucc := maxOverviewInt(0, ledger.SuccessTasks-ret.successImgTasks)
				extraFail := maxOverviewInt(0, ledger.FailedTasks-ret.failedImgTasks)
				extraImages := maxOverviewInt(0, ledger.SuccessImages-ret.successImages)
				if extraSucc > 0 || extraFail > 0 || extraImages > 0 {
					taskStats.Total += extraSucc + extraFail
					taskStats.Succeeded += extraSucc
					taskStats.Failed += extraFail
					taskStats.Finished += extraSucc + extraFail
					taskStats.TotalImages += extraImages
					if bIdx >= 0 {
						series[bIdx].Total += extraSucc + extraFail
						series[bIdx].Succeeded += extraSucc
						series[bIdx].Failed += extraFail
						series[bIdx].Images += extraImages
					}
				}
			}
			if capability == "all" || capability == "video" {
				extraSucc := maxOverviewInt(0, ledger.SuccessVideoTasks-ret.successVidTasks)
				extraFail := maxOverviewInt(0, ledger.FailedVideoTasks-ret.failedVidTasks)
				extraVideos := maxOverviewInt(0, ledger.SuccessVideos-ret.successVideos)
				if extraSucc > 0 || extraFail > 0 || extraVideos > 0 {
					taskStats.Total += extraSucc + extraFail
					taskStats.Succeeded += extraSucc
					taskStats.Failed += extraFail
					taskStats.Finished += extraSucc + extraFail
					taskStats.TotalVideos += extraVideos
					if bIdx >= 0 {
						series[bIdx].Total += extraSucc + extraFail
						series[bIdx].Succeeded += extraSucc
						series[bIdx].Failed += extraFail
						series[bIdx].Videos += extraVideos
					}
				}
			}
		}
	}

	taskStats.SuccessRate = overviewSuccessRate(taskStats.Succeeded, taskStats.Finished)
	if totalDurationCount > 0 {
		taskStats.AvgDurationMS = totalDurationSumMS / totalDurationCount
	}

	models := make([]adminOverviewModelRow, 0, len(modelAggs))
	for _, agg := range modelAggs {
		row := agg.row
		row.SuccessRate = overviewSuccessRate(row.Succeeded, row.Succeeded+row.Failed)
		if agg.durationCount > 0 {
			row.AvgDurationMS = agg.durationSumMS / agg.durationCount
		}
		models = append(models, row)
	}
	sort.Slice(models, func(i, j int) bool {
		if models[i].Total != models[j].Total {
			return models[i].Total > models[j].Total
		}
		if models[i].Capability != models[j].Capability {
			return models[i].Capability < models[j].Capability
		}
		if models[i].ChannelID != models[j].ChannelID {
			return models[i].ChannelID < models[j].ChannelID
		}
		return models[i].Model < models[j].Model
	})

	errorsList := make([]adminOverviewErrorRow, 0, len(errorAggs))
	for _, agg := range errorAggs {
		errorsList = append(errorsList, agg.row)
	}
	sort.Slice(errorsList, func(i, j int) bool {
		if errorsList[i].Count != errorsList[j].Count {
			return errorsList[i].Count > errorsList[j].Count
		}
		if errorsList[i].LastSeenAt != errorsList[j].LastSeenAt {
			return errorsList[i].LastSeenAt > errorsList[j].LastSeenAt
		}
		return errorsList[i].Reason < errorsList[j].Reason
	})
	if len(errorsList) > 20 {
		errorsList = errorsList[:20]
	}

	modelOptions := make([]string, 0, len(knownModels))
	for m := range knownModels {
		if m != "" {
			modelOptions = append(modelOptions, m)
		}
	}
	sort.Strings(modelOptions)
	filterOptions.Models = modelOptions

	usersSummary := a.collectOverviewUsers()
	paymentsSummary := a.collectOverviewPayments(period, now)
	poolsSummary := a.collectOverviewPools(r.Context())

	util.WriteJSON(w, http.StatusOK, adminOverviewResponse{
		Period:        period,
		Capability:    capability,
		Channel:       channelFilter,
		Model:         modelFilter,
		GeneratedAt:   now.Format(time.RFC3339),
		Tasks:         taskStats,
		Series:        series,
		Models:        models,
		Errors:        errorsList,
		FilterOptions: filterOptions,
		Users:         usersSummary,
		Payments:      paymentsSummary,
		Pools:         poolsSummary,
	})
}

func (a *App) buildOverviewChannelCatalog() (
	channelByID map[string]service.ImageChannelAdmin,
	modelByID map[string]service.ImageChannelModel,
	defaultChannelForModel map[string]service.ImageChannelAdmin,
	poolChannel adminOverviewChannelOption,
	grokChannel adminOverviewChannelOption,
	filterOptions adminOverviewFilterOptions,
	knownModels map[string]struct{},
) {
	channelByID = make(map[string]service.ImageChannelAdmin)
	modelByID = make(map[string]service.ImageChannelModel)
	defaultChannelForModel = make(map[string]service.ImageChannelAdmin)
	knownModels = make(map[string]struct{})
	poolChannel = adminOverviewChannelOption{ID: "local-account-pool", Name: "本地号池", Type: service.ImageChannelTypeAccountPool, Enabled: true}
	grokChannel = adminOverviewChannelOption{ID: "local-grok-runtime", Name: "Grok 号池", Type: service.ImageChannelTypeGrokRuntime, Enabled: true}

	options := make([]adminOverviewChannelOption, 0)
	if a != nil && a.imageChannels != nil {
		for _, ch := range a.imageChannels.ListAdmin() {
			channelByID[ch.ID] = ch
			opt := adminOverviewChannelOption{
				ID:      ch.ID,
				Name:    ch.Name,
				Type:    ch.Type,
				Enabled: ch.Enabled,
			}
			options = append(options, opt)
			if ch.Type == service.ImageChannelTypeAccountPool && (ch.System || poolChannel.ID == "local-account-pool") {
				poolChannel = opt
			}
			if ch.Type == service.ImageChannelTypeGrokRuntime && (ch.System || grokChannel.ID == "local-grok-runtime") {
				grokChannel = opt
			}
		}
		for _, m := range a.imageChannels.ListAllModels() {
			modelByID[m.ID] = m
			upstream := strings.TrimSpace(m.UpstreamModel)
			if upstream == "" {
				continue
			}
			knownModels[upstream] = struct{}{}
			ch, ok := channelByID[m.ChannelID]
			if !ok {
				continue
			}
			key := strings.ToLower(upstream)
			existing, hasExisting := defaultChannelForModel[key]
			if !hasExisting || (!existing.System && ch.System) || (!existing.Enabled && ch.Enabled) {
				defaultChannelForModel[key] = ch
			}
		}
	}
	knownModels["grok-imagine-1.0-video"] = struct{}{}
	filterOptions = adminOverviewFilterOptions{
		Channels: options,
		Models:   []string{},
	}
	return
}

func overviewTaskModelName(task *service.ImageTask, capType string) string {
	if task == nil {
		return ""
	}
	modelName := strings.TrimSpace(task.EffectiveModel)
	if modelName == "" {
		modelName = strings.TrimSpace(task.Model)
	}
	if modelName == "" {
		if capType == "video" {
			return "grok-imagine-1.0-video"
		}
		return util.ImageModelGPT
	}
	return modelName
}

func resolveOverviewTaskChannel(
	task *service.ImageTask,
	capType string,
	modelName string,
	channelByID map[string]service.ImageChannelAdmin,
	modelByID map[string]service.ImageChannelModel,
	defaultChannelForModel map[string]service.ImageChannelAdmin,
	poolChannel adminOverviewChannelOption,
	grokChannel adminOverviewChannelOption,
) (string, string) {
	if task == nil {
		return poolChannel.ID, poolChannel.Name
	}
	chID := strings.TrimSpace(task.ChannelID)
	chName := strings.TrimSpace(task.ChannelName)
	if chID == "" && strings.TrimSpace(task.ChannelModelID) != "" {
		if m, ok := modelByID[strings.TrimSpace(task.ChannelModelID)]; ok {
			chID = m.ChannelID
		}
	}
	if chID != "" {
		if chName == "" {
			if ch, ok := channelByID[chID]; ok {
				chName = ch.Name
			} else {
				chName = chID
			}
		}
		return chID, chName
	}
	effCh := strings.ToLower(strings.TrimSpace(task.EffectiveChannel))
	provSrc := strings.ToLower(strings.TrimSpace(task.ProviderSource))
	if capType == "video" || strings.Contains(effCh, "grok") || strings.Contains(provSrc, "grok") || strings.HasPrefix(strings.ToLower(modelName), "grok") {
		return grokChannel.ID, grokChannel.Name
	}
	if ch, ok := defaultChannelForModel[strings.ToLower(modelName)]; ok {
		return ch.ID, ch.Name
	}
	return poolChannel.ID, poolChannel.Name
}

func resolveOverviewTaskTimestamp(task *service.ImageTask, loc *time.Location) time.Time {
	if task == nil {
		return time.Time{}
	}
	status := strings.ToLower(strings.TrimSpace(task.Status))
	if status == service.TaskStatusRunning || status == service.TaskStatusQueued {
		if ts := parseOverviewTime(task.CreatedAt, loc); !ts.IsZero() {
			return ts
		}
		return parseOverviewTime(task.UpdatedAt, loc)
	}
	for _, candidate := range []string{task.FinishedAt, task.UpdatedAt, task.CreatedAt} {
		if ts := parseOverviewTime(candidate, loc); !ts.IsZero() {
			return ts
		}
	}
	return time.Time{}
}

func parseOverviewTime(raw string, loc *time.Location) time.Time {
	text := strings.TrimSpace(raw)
	if text == "" {
		return time.Time{}
	}
	if loc == nil {
		loc = util.ChinaLocation()
	}
	if t, err := time.Parse(time.RFC3339Nano, text); err == nil {
		return t.In(loc)
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05.999999", "2006-01-02T15:04:05"} {
		if t, err := time.ParseInLocation(layout, text, loc); err == nil {
			return t
		}
	}
	return time.Time{}
}

func overviewTaskSuccessOutputs(task *service.ImageTask, status string) int {
	if task == nil {
		return 0
	}
	if len(task.Data) > 0 {
		return len(task.Data)
	}
	if status == service.TaskStatusSuccess {
		if task.Count > 0 {
			return task.Count
		}
		return 1
	}
	return 0
}

func overviewTaskDurationMS(task *service.ImageTask, loc *time.Location) (int64, bool) {
	if task == nil {
		return 0, false
	}
	if task.DurationSeconds > 0 {
		return int64(math.Round(task.DurationSeconds * 1000)), true
	}
	started := parseOverviewTime(task.StartedAt, loc)
	finished := parseOverviewTime(task.FinishedAt, loc)
	if !started.IsZero() && !finished.IsZero() && !finished.Before(started) {
		return finished.Sub(started).Milliseconds(), true
	}
	return 0, false
}

func cleanOverviewErrorReason(errMsg, errCode string) string {
	reason := strings.TrimSpace(errMsg)
	if reason == "" {
		reason = strings.TrimSpace(errCode)
	}
	if reason == "" {
		return "未知错误"
	}
	if len(reason) > 200 {
		reason = strings.TrimSpace(reason[:200]) + "..."
	}
	return reason
}

func overviewSuccessRate(succeeded, finished int) float64 {
	if finished <= 0 || succeeded <= 0 {
		return 0
	}
	if succeeded >= finished {
		return 100
	}
	return math.Round(float64(succeeded)*10000/float64(finished)) / 100
}

func maxOverviewInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (a *App) collectOverviewUsers() adminOverviewUsers {
	var out adminOverviewUsers
	if a == nil {
		return out
	}
	if a.auth != nil {
		out.TotalUsers, out.ActiveUsers = a.auth.OverviewUserCounts()
	}
	if a.paymentAdmin != nil && a.paymentAdmin.Available() {
		if paid, err := a.paymentAdmin.PaidUsersCount(); err == nil {
			out.PaidUsers = paid
		}
	}
	if a.credits != nil {
		out.TotalCreditsBalance = a.credits.OverviewCreditBalanceTotal()
	}
	return out
}

func (a *App) collectOverviewPayments(period string, now time.Time) adminOverviewPayments {
	out := adminOverviewPayments{
		ChannelBreakdown: []adminOverviewPaymentChannel{},
	}
	if a == nil || a.paymentAdmin == nil || !a.paymentAdmin.Available() {
		return out
	}
	if settings, err := a.paymentAdmin.Settings(); err == nil {
		out.RechargeEnabled = settings.RechargeEnabled
	}
	stats, err := a.paymentAdmin.StatsAt(now)
	if err != nil {
		return out
	}
	out.TodayAmountFen = stats.Today.SucceededAmountFen
	out.Last7dAmountFen = stats.Last7Days.SucceededAmountFen
	out.Last30dAmountFen = stats.Last30Days.SucceededAmountFen
	out.AllTimeAmountFen = stats.AllTime.SucceededAmountFen
	out.AllTimeSucceededOrders = stats.AllTime.SucceededOrders

	var periodStats storage.PaymentStatsPeriod
	switch period {
	case "7d":
		periodStats = stats.Last7Days
	case "30d":
		periodStats = stats.Last30Days
	default:
		periodStats = stats.Today
	}
	out.PeriodAmountFen = periodStats.SucceededAmountFen
	out.PeriodSucceededOrders = periodStats.SucceededOrders
	out.PeriodTotalOrders = periodStats.TotalOrders

	providerByChannelID := make(map[string]string)
	if channels, chErr := a.paymentAdmin.ListChannels(); chErr == nil {
		for _, ch := range channels {
			label := strings.TrimSpace(ch.Provider)
			if label == "" {
				label = strings.TrimSpace(ch.ID)
			}
			providerByChannelID[ch.ID] = label
		}
	}

	byChannel := make(map[string]*adminOverviewPaymentChannel)
	for _, row := range stats.ChannelBreakdown {
		name := providerByChannelID[row.ChannelID]
		if name == "" {
			name = strings.TrimSpace(row.ChannelID)
		}
		if name == "" {
			name = "unknown"
		}
		entry, ok := byChannel[name]
		if !ok {
			entry = &adminOverviewPaymentChannel{Channel: name}
			byChannel[name] = entry
		}
		entry.AmountFen += row.SucceededAmountFen
		entry.Orders += row.SucceededOrders
	}
	breakdown := make([]adminOverviewPaymentChannel, 0, len(byChannel))
	for _, entry := range byChannel {
		breakdown = append(breakdown, *entry)
	}
	sort.Slice(breakdown, func(i, j int) bool {
		if breakdown[i].AmountFen != breakdown[j].AmountFen {
			return breakdown[i].AmountFen > breakdown[j].AmountFen
		}
		return breakdown[i].Channel < breakdown[j].Channel
	})
	out.ChannelBreakdown = breakdown
	return out
}

func (a *App) collectOverviewPools(parentCtx context.Context) adminOverviewPools {
	var out adminOverviewPools
	if a == nil {
		return out
	}
	if a.accounts != nil {
		openai := a.accounts.OverviewPoolSummary()
		out.OpenAI = adminOverviewOpenAIPool{
			Total:       openai.Total,
			Available:   openai.Available,
			Cooling:     openai.Cooling,
			Quarantined: openai.Quarantined,
			Disabled:    openai.Disabled,
		}
	}
	if a.config != nil {
		out.ProxyEnabled = strings.TrimSpace(a.config.Proxy()) != ""
		enabled := a.config.UpstreamClearanceEnabled()
		mode := strings.TrimSpace(strings.ToLower(a.config.UpstreamClearanceMode()))
		if mode == "" {
			if enabled {
				mode = "flaresolverr"
			} else {
				mode = "none"
			}
		} else if !enabled && mode != "none" {
			mode = "none"
		}
		out.ClearanceMode = mode
	} else {
		out.ClearanceMode = service.UpstreamClearanceMode()
	}
	out.Grok = a.fetchOverviewGrokPool(parentCtx)
	return out
}

func (a *App) fetchOverviewGrokPool(parentCtx context.Context) adminOverviewGrokPool {
	var pool adminOverviewGrokPool
	if a == nil || a.config == nil {
		return pool
	}
	base := strings.TrimSpace(a.config.GrokRuntimeBaseURL())
	if base == "" {
		return pool
	}
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	ctx, cancel := context.WithTimeout(parentCtx, overviewGrokRuntimeTimeout)
	defer cancel()

	client := sidecar.New(base, a.config.InternalServiceToken())
	status, data, err := client.DoJSON(ctx, http.MethodGet, "/api/grok/provider-accounts?page=1&page_size=1", nil)
	if err != nil || status < http.StatusOK || status >= http.StatusMultipleChoices || len(data) == 0 {
		return pool
	}

	var payload struct {
		Summary struct {
			Total              int            `json:"total"`
			RoutableByProvider map[string]int `json:"routable_by_provider"`
			ByStatus           map[string]int `json:"by_status"`
			TheoreticalSlots   int            `json:"theoretical_slots"`
			QuotaExhausted     int            `json:"quota_exhausted"`
			Available          *int           `json:"available"`
			Cooling            *int           `json:"cooling"`
			Quarantined        *int           `json:"quarantined"`
			Disabled           *int           `json:"disabled"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return pool
	}

	s := payload.Summary
	pool.Total = s.Total
	pool.TheoreticalSlots = s.TheoreticalSlots

	if s.Disabled != nil {
		pool.Disabled = *s.Disabled
	} else {
		pool.Disabled = s.ByStatus["disabled"]
	}
	if s.Quarantined != nil {
		pool.Quarantined = *s.Quarantined
	} else {
		pool.Quarantined = s.ByStatus["error"]
	}

	activeCount := s.ByStatus["active"]
	if s.Cooling != nil {
		pool.Cooling = *s.Cooling
	} else {
		cooling := s.ByStatus["cooling"] + s.QuotaExhausted
		if activeCount > 0 && cooling > activeCount {
			cooling = activeCount
		}
		pool.Cooling = cooling
	}

	if s.Available != nil {
		pool.Available = *s.Available
	} else {
		routable := 0
		for _, count := range s.RoutableByProvider {
			routable += count
		}
		baseAvailable := routable
		if baseAvailable == 0 && activeCount > 0 {
			baseAvailable = activeCount
		}
		pool.Available = maxOverviewInt(0, baseAvailable-pool.Cooling)
	}
	return pool
}
