package httpapi

import (
	"bytes"
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
)

var errRequestBodyTooLarge = errors.New("request body too large")

// readJSONMapOr400 decodes JSON object body or writes 400 and returns ok=false.
// Empty/malformed bodies are rejected so handlers cannot silently no-op into defaults.
func readJSONMapOr400(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return nil, false
	}
	return body, true
}

// readJSONOr400 decodes the request body into dst (struct or map). Rejects empty/malformed JSON.
func readJSONOr400(w http.ResponseWriter, r *http.Request, dst any) bool {
	raw, err := readRequestBody(r, jsonBodyLimit(r))
	if err != nil {
		if errors.Is(err, errRequestBodyTooLarge) {
			util.WriteError(w, http.StatusBadRequest, "请求体过大")
		} else {
			util.WriteError(w, http.StatusBadRequest, "读取请求体失败")
		}
		return false
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(dst); err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return false
	}
	return true
}

// readJSONMapRawOr400 returns both raw bytes and decoded map (for re-proxy after inspect).
func readJSONMapRawOr400(w http.ResponseWriter, r *http.Request) ([]byte, map[string]any, bool) {
	raw, err := readRequestBody(r, jsonBodyLimit(r))
	if err != nil {
		if errors.Is(err, errRequestBodyTooLarge) {
			util.WriteError(w, http.StatusBadRequest, "请求体过大")
		} else {
			util.WriteError(w, http.StatusBadRequest, "读取请求体失败")
		}
		return nil, nil, false
	}
	body, err := decodeJSONMap(raw, true)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return nil, nil, false
	}
	return raw, body, true
}

func readJSONMap(r *http.Request) (map[string]any, error) {
	raw, err := readRequestBody(r, jsonBodyLimit(r))
	if err != nil {
		return nil, err
	}
	return decodeJSONMap(raw, false)
}

func readRequestBody(r *http.Request, limit int64) ([]byte, error) {
	if r == nil || r.Body == nil {
		return nil, nil
	}
	if r.ContentLength > limit {
		_ = r.Body.Close()
		return nil, errRequestBodyTooLarge
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, limit+1))
	_ = r.Body.Close()
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > limit {
		return nil, errRequestBodyTooLarge
	}
	return raw, nil
}

func decodeJSONMap(raw []byte, allowEmpty bool) (map[string]any, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		if allowEmpty {
			return map[string]any{}, nil
		}
		return nil, io.EOF
	}
	var body map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&body); err != nil {
		return nil, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("multiple JSON values")
		}
		return nil, err
	}
	if body == nil {
		body = map[string]any{}
	}
	return body, nil
}

const (
	maxJSONBodyBytes      = 4 << 20   // 4MB for ordinary API requests.
	maxImageJSONBodyBytes = 128 << 20 // Allows four 20MB images after base64 expansion.
	// Multipart memory budget for image edit/upload forms (fields + files).
	maxMultipartFormMemory = 32 << 20 // 32MB
	// Per-file hard limit (also enforced with LimitReader; Size header is advisory).
	maxUploadImageBytes = 20 << 20 // 20MB
	// Cap concurrent source images on one edit request (matches billed n upper bound).
	maxUploadImageFiles = 4
	// Four max-sized files plus form fields and multipart framing.
	maxMultipartBodyBytes = maxUploadImageBytes*maxUploadImageFiles + (4 << 20)
)

func jsonBodyLimit(r *http.Request) int64 {
	if r == nil || r.URL == nil {
		return maxJSONBodyBytes
	}
	switch r.URL.Path {
	case "/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1/videos":
		return maxImageJSONBodyBytes
	default:
		if strings.HasPrefix(r.URL.Path, "/api/creation-tasks/") {
			return maxImageJSONBodyBytes
		}
		return maxJSONBodyBytes
	}
}

func parseMultipartFormWithinLimit(w http.ResponseWriter, r *http.Request, bodyLimit, memoryLimit int64) error {
	if r.ContentLength > bodyLimit {
		return errRequestBodyTooLarge
	}
	r.Body = http.MaxBytesReader(w, r.Body, bodyLimit)
	return r.ParseMultipartForm(memoryLimit)
}

func readMultipartImageBody(w http.ResponseWriter, r *http.Request) (map[string]any, []protocol.UploadedImage, error) {
	if err := parseMultipartFormWithinLimit(w, r, maxMultipartBodyBytes, maxMultipartFormMemory); err != nil {
		return nil, nil, fmt.Errorf("解析上传表单失败（体积可能过大）")
	}
	body := map[string]any{
		"client_task_id":     firstForm(r.MultipartForm, "client_task_id"),
		"prompt":             firstForm(r.MultipartForm, "prompt"),
		"model":              firstNonEmpty(firstForm(r.MultipartForm, "model"), util.ImageModelAuto),
		"n":                  util.ToInt(firstForm(r.MultipartForm, "n"), 1),
		"size":               firstForm(r.MultipartForm, "size"),
		"quality":            firstForm(r.MultipartForm, "quality"),
		"output_format":      firstForm(r.MultipartForm, "output_format"),
		"output_compression": firstForm(r.MultipartForm, "output_compression"),
		"visibility":         firstForm(r.MultipartForm, "visibility"),
		"response_format":    firstNonEmpty(firstForm(r.MultipartForm, "response_format"), "b64_json"),
		"stream":             util.ToBool(firstForm(r.MultipartForm, "stream")),
	}
	if rawMessages := strings.TrimSpace(firstForm(r.MultipartForm, "messages")); rawMessages != "" {
		var messages any
		if err := json.Unmarshal([]byte(rawMessages), &messages); err != nil {
			return nil, nil, fmt.Errorf("messages 不是合法 JSON")
		}
		body["messages"] = messages
	}
	var images []protocol.UploadedImage
	for _, field := range []string{"image", "image[]"} {
		for _, header := range r.MultipartForm.File[field] {
			if len(images) >= maxUploadImageFiles {
				return nil, nil, fmt.Errorf("最多上传 %d 张图片", maxUploadImageFiles)
			}
			if header != nil && header.Size > maxUploadImageBytes {
				return nil, nil, fmt.Errorf("单张图片不能超过 %dMB", maxUploadImageBytes>>20)
			}
			image, err := readUpload(header)
			if err != nil {
				return nil, nil, err
			}
			if len(image.Data) == 0 {
				return nil, nil, fmt.Errorf("图片文件为空")
			}
			images = append(images, image)
		}
	}
	return body, images, nil
}

func firstForm(form *multipart.Form, key string) string {
	if form == nil || len(form.Value[key]) == 0 {
		return ""
	}
	return form.Value[key][0]
}

func readUpload(header *multipart.FileHeader) (protocol.UploadedImage, error) {
	if header == nil {
		return protocol.UploadedImage{}, fmt.Errorf("缺少上传文件")
	}
	file, err := header.Open()
	if err != nil {
		return protocol.UploadedImage{}, err
	}
	defer file.Close()
	// Read at most max+1 so oversized bodies are rejected without unbounded allocation.
	data, err := io.ReadAll(io.LimitReader(file, maxUploadImageBytes+1))
	if err != nil {
		return protocol.UploadedImage{}, err
	}
	if int64(len(data)) > maxUploadImageBytes {
		return protocol.UploadedImage{}, fmt.Errorf("单张图片不能超过 %dMB", maxUploadImageBytes>>20)
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}
	filename := header.Filename
	if filename == "" {
		filename = "image.png"
	}
	return protocol.UploadedImage{Data: data, Filename: filename, ContentType: contentType}, nil
}

func jsonString(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func openAIErrorForStream(err error) map[string]any {
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) {
		return imageErr.OpenAIError()
	}
	return map[string]any{"error": map[string]any{"message": err.Error(), "type": fmt.Sprintf("%T", err)}}
}

func anyList(v any) []any {
	if list, ok := v.([]any); ok {
		return list
	}
	if list, ok := v.([]map[string]any); ok {
		out := make([]any, len(list))
		for i, item := range list {
			out[i] = item
		}
		return out
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
