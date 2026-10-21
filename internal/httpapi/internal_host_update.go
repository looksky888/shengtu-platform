package httpapi

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"chatgpt2api/internal/util"
)

const (
	internalHostUpdateDrainPath  = "/internal/v1/host-update/drain"
	internalHostUpdateStatusPath = "/internal/v1/host-update/status"
	internalHostUpdateResumePath = "/internal/v1/host-update/resume"
)

func (a *App) handleInternalHostUpdate(w http.ResponseWriter, r *http.Request) {
	if !hostUpdaterBearerMatches(r.Header.Get("Authorization"), a.hostUpdaterToken) {
		w.Header().Set("WWW-Authenticate", "Bearer")
		util.WriteCodedError(w, http.StatusUnauthorized, "unauthorized", "invalid host updater token")
		return
	}
	if a.tasks == nil || a.updateAdmission == nil {
		util.WriteCodedError(w, http.StatusServiceUnavailable, "update_control_unavailable", "更新排空服务未初始化")
		return
	}
	switch r.URL.Path {
	case internalHostUpdateDrainPath:
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		requests := a.updateAdmission.beginDrain("版本更新准备中，暂不接收新的写入请求")
		tasks := a.tasks.BeginDrain("版本更新准备中，暂不接收新的创作任务")
		util.WriteJSON(w, http.StatusOK, systemTaskDrainResponse{
			Message: "已停止接收新的写入与创作任务", Drained: updateDrainComplete(tasks, requests), Tasks: tasks, Requests: requests,
		})
	case internalHostUpdateStatusPath:
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		tasks := a.tasks.DrainSnapshot()
		requests := a.updateAdmission.snapshot()
		util.WriteJSON(w, http.StatusOK, systemTaskDrainResponse{
			Message: "当前更新排空状态", Drained: updateDrainComplete(tasks, requests), Tasks: tasks, Requests: requests,
		})
	case internalHostUpdateResumePath:
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		tasks, err := a.tasks.ResumeAdmission()
		if err != nil {
			util.WriteCodedError(w, http.StatusConflict, "update_resume_failed", err.Error())
			return
		}
		requests := a.updateAdmission.resume()
		util.WriteJSON(w, http.StatusOK, systemTaskDrainResponse{
			Message: "已恢复接收写入与创作任务", Drained: updateDrainComplete(tasks, requests), Tasks: tasks, Requests: requests,
		})
	default:
		http.NotFound(w, r)
	}
}

func hostUpdaterBearerMatches(header, expected string) bool {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	expected = strings.TrimSpace(expected)
	provided := strings.TrimSpace(strings.TrimPrefix(header, prefix))
	if len(expected) < 32 || len(provided) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}
