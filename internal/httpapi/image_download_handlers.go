package httpapi

import (
	"archive/zip"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

const maxImageArchiveItems = 100

type imageArchiveRequest struct {
	Paths []string `json:"paths"`
}

// handleImageArchive streams one ZIP for a selected image batch. Each object
// is copied into the archive one at a time, keeping memory bounded for local
// files and R2-backed media alike.
func (a *App) handleImageArchive(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	request, err := readImageArchiveRequest(w, r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(request.Paths) == 0 {
		util.WriteError(w, http.StatusBadRequest, "请至少选择一张图片")
		return
	}
	if len(request.Paths) > maxImageArchiveItems {
		util.WriteError(w, http.StatusBadRequest, fmt.Sprintf("单次最多下载 %d 张图片", maxImageArchiveItems))
		return
	}
	scope := imageAccessScope(identity)
	accesses := make([]service.ImageFileAccess, 0, len(request.Paths))
	seen := make(map[string]struct{}, len(request.Paths))
	for _, value := range request.Paths {
		access, err := a.images.ImageFileAccess(value, scope)
		if err != nil {
			util.WriteError(w, http.StatusNotFound, "图片不存在或无权访问")
			return
		}
		if _, exists := seen[access.Rel]; exists {
			continue
		}
		seen[access.Rel] = struct{}{}
		accesses = append(accesses, access)
	}
	if len(accesses) == 0 {
		util.WriteError(w, http.StatusBadRequest, "没有可下载的图片")
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="shengtu-images-`+time.Now().Format("20060102-150405")+`.zip"`)
	w.Header().Set("Cache-Control", "no-store")
	archive := zip.NewWriter(w)
	names := make(map[string]int, len(accesses))
	for _, access := range accesses {
		reader, _, err := a.images.OpenImage(r.Context(), access)
		if err == nil {
			name := archiveEntryName(access.Rel, names)
			header := &zip.FileHeader{Name: name, Method: zip.Store}
			header.Modified = time.Now()
			writer, createErr := archive.CreateHeader(header)
			if createErr != nil {
				err = createErr
			} else {
				_, err = io.Copy(writer, reader)
			}
			closeErr := reader.Close()
			if err == nil {
				err = closeErr
			}
		}
		if err != nil {
			_ = archive.Close()
			if a.logger != nil {
				a.logger.Error("stream image archive item failed", "path", access.Rel, "error", err.Error())
			}
			return
		}
	}
	if err := archive.Close(); err != nil && a.logger != nil {
		a.logger.Error("close image archive failed", "error", err.Error())
	}
}

func readImageArchiveRequest(w http.ResponseWriter, r *http.Request) (imageArchiveRequest, error) {
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	if strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		var request imageArchiveRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			return imageArchiveRequest{}, errors.New("请求体不是合法 JSON")
		}
		return request, nil
	}
	if err := r.ParseForm(); err != nil {
		return imageArchiveRequest{}, errors.New("下载参数无效")
	}
	return imageArchiveRequest{Paths: r.PostForm["paths"]}, nil
}

func archiveEntryName(rel string, names map[string]int) string {
	base := filepath.Base(filepath.FromSlash(strings.TrimSpace(rel)))
	if base == "" || base == "." || base == string(filepath.Separator) {
		base = "image"
	}
	count := names[base]
	names[base] = count + 1
	if count == 0 {
		return base
	}
	extension := filepath.Ext(base)
	stem := strings.TrimSuffix(base, extension)
	return fmt.Sprintf("%s-%d%s", stem, count+1, extension)
}
