package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleAdminImageTaskTodayStats(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	util.WriteJSON(w, http.StatusOK, statsResponse[service.ImageTaskDailyStats]{Stats: a.tasks.TodayStats(util.NowChina())})
}

func (a *App) handleStudioImageTaskTodayStats(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	util.WriteJSON(w, http.StatusOK, statsResponse[service.ImageTaskDailyStats]{Stats: a.tasks.TodayStats(util.NowChina())})
}

func (a *App) handleAdminImageTaskStats(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	period := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("period")))
	if period == "" {
		period = "day"
	}
	dateText := strings.TrimSpace(r.URL.Query().Get("date"))
	base := time.Now().In(loc)
	if dateText != "" {
		parsed, err := time.ParseInLocation("2006-01-02", dateText, loc)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "日期格式须为 YYYY-MM-DD")
			return
		}
		base = parsed
	}
	start := time.Date(base.Year(), base.Month(), base.Day(), 0, 0, 0, 0, loc)
	end := start.AddDate(0, 0, 1)
	switch period {
	case "today", "day":
		period = "day"
	case "week":
		weekday := int(start.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		start = start.AddDate(0, 0, -(weekday - 1))
		end = start.AddDate(0, 0, 7)
	case "month":
		start = time.Date(base.Year(), base.Month(), 1, 0, 0, 0, 0, loc)
		end = start.AddDate(0, 1, 0)
	default:
		util.WriteError(w, http.StatusBadRequest, "统计周期仅支持 day、week 或 month")
		return
	}
	util.WriteJSON(w, http.StatusOK, statsResponse[service.ImageTaskDailyStats]{Stats: a.tasks.StatsBetween(period, start, end)})
}

func (a *App) handleAdminImageTaskLogs(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	filters := map[string]string{
		"q": r.URL.Query().Get("q"), "status": r.URL.Query().Get("status"),
		"user": r.URL.Query().Get("user"), "model": r.URL.Query().Get("model"),
		"size": r.URL.Query().Get("size"), "limit": r.URL.Query().Get("limit"),
		"offset": r.URL.Query().Get("offset"), "summary": r.URL.Query().Get("summary"),
	}
	util.WriteJSON(w, http.StatusOK, a.tasks.ListTaskLogsTyped(filters))
}

func (a *App) handleAdminImageTaskCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "image-task-logs" && parts[3] == "batch-cancel" {
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		util.WriteJSON(w, http.StatusOK, a.tasks.AdminCancelTasksTyped(util.AsStringSlice(body["ids"])))
		return
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "image-task-logs" && parts[3] == "clear" {
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		scope := ""
		if body != nil {
			scope = util.Clean(body["scope"])
		}
		result, err := a.tasks.AdminClearTasksTyped(scope)
		if err != nil {
			util.WriteError(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, result)
		return
	}
	if len(parts) != 5 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "image-task-logs" || parts[4] != "cancel" {
		http.NotFound(w, r)
		return
	}
	task, err := a.tasks.AdminCancelTask(parts[3])
	if err != nil {
		util.WriteError(w, creationTaskErrorStatus(err), mapCreationTaskError(err))
		return
	}
	util.WriteJSON(w, http.StatusOK, service.ImageTaskPublicFromMap(task))
}

func (a *App) handleAdminTaskQueueEvents(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	flusher, _ := w.(http.Flusher)
	for payload := range a.tasks.SubscribeTaskQueue(r.Context()) {
		fmt.Fprintf(w, "data: %s\n\n", payload)
		if flusher != nil {
			flusher.Flush()
		}
	}
}

func (a *App) handleAdminAccountPoolHealth(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	qlist := a.accounts.ListQuarantineListTyped("")
	util.WriteJSON(w, http.StatusOK, accountPoolHealthResponse{
		Pool: a.accounts.PoolHealthTyped(), Quarantine: qlist.Items, QuarantineMeta: qlist,
		TemporaryCount: qlist.TemporaryCount, PermanentCount: qlist.PermanentCount,
		QuarantineTotal: qlist.TemporaryCount + qlist.PermanentCount + qlist.OtherCount,
	})
}

func (a *App) handleAdminAccountQuarantine(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, a.accounts.ListQuarantineListTyped(strings.TrimSpace(r.URL.Query().Get("grade"))))
	case http.MethodPost:
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		if strings.EqualFold(util.Clean(body["action"]), "purge") {
			result := a.accounts.PurgeQuarantineTyped(util.Clean(body["token_hash"]), true)
			if !result.Purged && result.Error == "not found" {
				result.Error = "隔离记录不存在"
			}
			util.WriteJSON(w, http.StatusOK, result)
			return
		}
		result := a.accounts.RestoreQuarantineTyped(util.Clean(body["token_hash"]))
		if !result.Restored && result.Error == "not found" {
			result.Error = "隔离记录不存在或无可恢复 token"
		}
		util.WriteJSON(w, http.StatusOK, result)
	case http.MethodDelete:
		if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("all")), "true") && strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("grade")), "permanent") {
			util.WriteJSON(w, http.StatusOK, a.accounts.PurgePermanentQuarantineAllTyped())
			return
		}
		tokenHash := strings.TrimSpace(r.URL.Query().Get("token_hash"))
		if tokenHash == "" {
			util.WriteError(w, http.StatusBadRequest, "请提供 token_hash")
			return
		}
		result := a.accounts.PurgeQuarantineTyped(tokenHash, true)
		if !result.Purged {
			status := http.StatusBadRequest
			if result.Error == "not found" || result.Error == "隔离记录不存在" {
				status = http.StatusNotFound
				if result.Error == "not found" {
					result.Error = "隔离记录不存在"
				}
			}
			util.WriteJSON(w, status, result)
			return
		}
		util.WriteJSON(w, http.StatusOK, result)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
