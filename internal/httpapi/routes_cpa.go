package httpapi

import (
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleCPA(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) == 3 && r.URL.Path == "/api/cpa/pools" {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, poolsResponse[service.CPAPoolPublic]{Pools: a.cpa.ListPoolsTyped()})
		case http.MethodPost:
			var body service.CPAPoolCreate
			if !readJSONOr400(w, r, &body) {
				return
			}
			if util.Clean(body.BaseURL) == "" {
				util.WriteError(w, http.StatusBadRequest, "请填写 base_url")
				return
			}
			if util.Clean(body.SecretKey) == "" {
				util.WriteError(w, http.StatusBadRequest, "请填写 secret_key")
				return
			}
			pool, err := a.cpa.AddPool(util.Clean(body.Name), util.Clean(body.BaseURL), util.Clean(body.SecretKey))
			if err != nil {
				util.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, poolListResponse[service.CPAPoolPublic]{
				Pool:  pool,
				Pools: a.cpa.ListPoolsTyped(),
			})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) < 4 {
		http.NotFound(w, r)
		return
	}
	poolID := parts[3]
	if _, ok := a.cpa.GetPoolRecord(poolID); !ok {
		util.WriteError(w, http.StatusNotFound, "连接池不存在")
		return
	}
	if len(parts) == 4 {
		switch r.Method {
		case http.MethodPost:
			var body service.CPAPoolUpdate
			if !readJSONOr400(w, r, &body) {
				return
			}
			updated, err := a.cpa.UpdatePool(poolID, body)
			if err != nil {
				util.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if updated.ID == "" {
				util.WriteError(w, http.StatusNotFound, "连接池不存在")
				return
			}
			util.WriteJSON(w, http.StatusOK, poolListResponse[service.CPAPoolPublic]{
				Pool:  updated,
				Pools: a.cpa.ListPoolsTyped(),
			})
		case http.MethodDelete:
			deleted, err := a.cpa.DeletePool(poolID)
			if err != nil {
				util.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if !deleted {
				util.WriteError(w, http.StatusNotFound, "连接池不存在")
				return
			}
			util.WriteJSON(w, http.StatusOK, poolsResponse[service.CPAPoolPublic]{Pools: a.cpa.ListPoolsTyped()})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	// Import workers still accept map shape internally; bridge from record.
	poolMap := a.cpa.GetPool(poolID)
	if len(parts) == 5 && parts[4] == "files" && r.Method == http.MethodGet {
		files, err := a.cpaImport.ListRemoteFilesTyped(r.Context(), poolMap)
		if err != nil {
			util.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, poolFilesResponse[service.CPARemoteFilePublic]{PoolID: poolID, Files: files})
		return
	}
	if len(parts) == 5 && parts[4] == "import" {
		if r.Method == http.MethodGet {
			util.WriteJSON(w, http.StatusOK, importJobResponse[*service.CPAImportJobPublic]{ImportJob: a.cpa.GetImportJobTyped(poolID)})
			return
		}
		if r.Method == http.MethodPost {
			var body struct {
				Names []string `json:"names"`
			}
			if !readJSONOr400(w, r, &body) {
				return
			}
			job, err := a.cpaImport.StartImportTyped(poolMap, body.Names)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, importJobResponse[*service.CPAImportJobPublic]{ImportJob: job})
			return
		}
	}
	http.NotFound(w, r)
}
