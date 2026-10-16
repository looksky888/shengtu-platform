package httpapi

import (
	"encoding/base64"
	"strings"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
)

// normalizeTaskImages accepts creation-task image payloads in several shapes:
//   - []protocol.UploadedImage (in-process multipart path)
//   - []any of UploadedImage / map / data-URL / raw base64 strings (JSON rehydrate)
//   - single string data URL
func normalizeTaskImages(raw any) []protocol.UploadedImage {
	if raw == nil {
		return nil
	}
	if images, ok := raw.([]protocol.UploadedImage); ok {
		return images
	}
	if one, ok := raw.(protocol.UploadedImage); ok {
		if len(one.Data) > 0 {
			return []protocol.UploadedImage{one}
		}
		return nil
	}
	if s, ok := raw.(string); ok {
		return imagesFromTextRef(s)
	}
	var out []protocol.UploadedImage
	for _, item := range util.AsMapSlice(raw) {
		if img := uploadedImageFromMap(item); len(img.Data) > 0 {
			out = append(out, img)
		}
	}
	if len(out) > 0 {
		return out
	}
	// []any may contain strings or UploadedImage values, not only maps.
	switch list := raw.(type) {
	case []any:
		for _, item := range list {
			switch v := item.(type) {
			case protocol.UploadedImage:
				if len(v.Data) > 0 {
					out = append(out, v)
				}
			case string:
				out = append(out, imagesFromTextRef(v)...)
			case map[string]any:
				if img := uploadedImageFromMap(v); len(img.Data) > 0 {
					out = append(out, img)
				}
			case []byte:
				if len(v) > 0 {
					out = append(out, protocol.UploadedImage{Data: v, Filename: "image.png", ContentType: "image/png"})
				}
			}
		}
	}
	return out
}

func uploadedImageFromMap(item map[string]any) protocol.UploadedImage {
	if len(item) == 0 {
		return protocol.UploadedImage{}
	}
	if data, ok := item["Data"].([]byte); ok && len(data) > 0 {
		return protocol.UploadedImage{
			Data:        data,
			Filename:    firstNonEmpty(util.Clean(item["Filename"]), "image.png"),
			ContentType: firstNonEmpty(util.Clean(item["ContentType"]), "image/png"),
		}
	}
	if data, ok := item["data"].([]byte); ok && len(data) > 0 {
		return protocol.UploadedImage{
			Data:        data,
			Filename:    firstNonEmpty(util.Clean(item["filename"]), "image.png"),
			ContentType: firstNonEmpty(util.Clean(item["content_type"]), util.Clean(item["mime"]), "image/png"),
		}
	}
	// JSON may store bytes as base64 string fields.
	for _, key := range []string{"data", "b64_json", "base64", "image"} {
		if ref := util.Clean(item[key]); ref != "" {
			if imgs := imagesFromTextRef(ref); len(imgs) > 0 {
				img := imgs[0]
				if name := firstNonEmpty(util.Clean(item["filename"]), util.Clean(item["Filename"])); name != "" {
					img.Filename = name
				}
				if ct := firstNonEmpty(util.Clean(item["content_type"]), util.Clean(item["ContentType"])); ct != "" {
					img.ContentType = ct
				}
				return img
			}
		}
	}
	return protocol.UploadedImage{}
}

func imagesFromTextRef(ref string) []protocol.UploadedImage {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil
	}
	if extracted := protocol.ExtractImagesFromText(ref); len(extracted) > 0 {
		return extracted
	}
	// Raw base64 without data: prefix.
	if data, err := base64.StdEncoding.DecodeString(ref); err == nil && len(data) > 0 {
		return []protocol.UploadedImage{{Data: data, Filename: "image.png", ContentType: "image/png"}}
	}
	if data, err := base64.RawStdEncoding.DecodeString(ref); err == nil && len(data) > 0 {
		return []protocol.UploadedImage{{Data: data, Filename: "image.png", ContentType: "image/png"}}
	}
	return nil
}
