package protocol

import (
	"bytes"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chatgpt2api/internal/util"

	"github.com/HugoSmits86/nativewebp"
)

func (e *Engine) CollectImageOutputs(outputs <-chan ImageOutput, errCh <-chan error) (map[string]any, error) {
	var created int64
	var data []map[string]any
	message := ""
	var progress []string
	for output := range outputs {
		if created == 0 {
			created = output.Created
		}
		switch output.Kind {
		case "progress":
			if output.Text != "" {
				progress = append(progress, output.Text)
			}
		case "message":
			message = output.Text
		case "result":
			data = append(data, output.Data...)
		}
	}
	streamErr := <-errCh
	if created == 0 {
		created = time.Now().Unix()
	}
	result := map[string]any{"created": created, "data": data}
	if len(data) == 0 {
		if text := firstNonEmpty(message, strings.TrimSpace(strings.Join(progress, ""))); text != "" {
			result["message"] = text
		}
	}
	if streamErr != nil {
		if imageErr, ok := streamErr.(*ImageGenerationError); ok && imageErr.Code == "image_generation_text_response" {
			result["output_type"] = "text"
		}
		if result["message"] == nil {
			result["message"] = streamErr.Error()
		}
		return result, streamErr
	}
	return result, nil
}

func (e *Engine) FormatImageResult(items []map[string]any, prompt, responseFormat, baseURL, ownerID, ownerName string, created int64, message string) (map[string]any, error) {
	return e.FormatImageResultWithOptions(items, prompt, responseFormat, baseURL, ownerID, ownerName, created, message, ImageOutputOptions{})
}

func (e *Engine) FormatImageResultWithOptions(items []map[string]any, prompt, responseFormat, baseURL, ownerID, ownerName string, created int64, message string, options ImageOutputOptions) (map[string]any, error) {
	defaultFormat := NormalizeImageOutputFormat(options.Format)
	var data []map[string]any
	for _, item := range items {
		b64 := util.Clean(item["b64_json"])
		if b64 == "" {
			continue
		}
		revised := firstNonEmpty(util.Clean(item["revised_prompt"]), prompt)
		imageBytes, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			continue
		}
		itemOptions := options
		if itemFormat := strings.TrimSpace(util.Clean(item["output_format"])); itemFormat != "" {
			itemOptions.Format = NormalizeImageOutputFormat(itemFormat)
		}
		if itemOptions.Format == "" {
			itemOptions.Format = defaultFormat
		}
		if compression, ok := normalizedImageOutputCompression(item["output_compression"]); ok {
			itemOptions.Compression = &compression
		}
		imageBytes, err = encodeImageBytes(imageBytes, itemOptions)
		if err != nil {
			continue
		}
		outputFormat := NormalizeImageOutputFormat(itemOptions.Format)
		urlValue, err := e.SaveImageBytesForOwnerWithFormat(imageBytes, baseURL, ownerID, ownerName, outputFormat)
		if err != nil {
			return nil, fmt.Errorf("保存图片失败: %w", err)
		}
		responseItem := map[string]any{"url": urlValue, "revised_prompt": revised, "output_format": outputFormat}
		if responseFormat == "b64_json" {
			responseItem["b64_json"] = base64.StdEncoding.EncodeToString(imageBytes)
		}
		data = append(data, responseItem)
	}
	if created == 0 {
		created = time.Now().Unix()
	}
	result := map[string]any{"created": created, "data": data}
	if message != "" && len(data) == 0 {
		result["message"] = message
	}
	return result, nil
}

func (e *Engine) SaveImageBytes(imageData []byte, baseURL string) (string, error) {
	return e.SaveImageBytesForOwner(imageData, baseURL, "", "")
}

func (e *Engine) SaveImageBytesForOwner(imageData []byte, baseURL, ownerID, ownerName string) (string, error) {
	return e.SaveImageBytesForOwnerWithFormat(imageData, baseURL, ownerID, ownerName, "png")
}

func (e *Engine) SaveImageBytesForOwnerWithFormat(imageData []byte, baseURL, ownerID, ownerName, outputFormat string) (string, error) {
	if len(imageData) == 0 {
		return "", fmt.Errorf("图片数据为空")
	}
	if e == nil || e.Config == nil {
		return "", fmt.Errorf("图片配置未初始化")
	}
	if e.Media != nil {
		return e.Media.StoreImage(imageData, baseURL, ownerID, ownerName, outputFormat)
	}
	outputFormat = NormalizeImageOutputFormat(outputFormat)
	cleanupOldImagesIfDue(e.Config)
	sum := md5.Sum(imageData)
	filename := fmt.Sprintf("%d_%s.%s", time.Now().Unix(), hex.EncodeToString(sum[:]), imageFileExtension(outputFormat))
	y, m, d := util.ChinaDatePath()
	relativeDir := filepath.Join(y, m, d)
	rel := filepath.Join(relativeDir, filename)
	filePath := filepath.Join(e.Config.ImagesDir(), rel)
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		return "", fmt.Errorf("创建图片目录失败: %w", err)
	}
	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, imageData, 0o644); err != nil {
		return "", fmt.Errorf("写入图片失败: %w", err)
	}
	if err := os.Rename(tmpPath, filePath); err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("提交图片文件失败: %w", err)
	}
	if err := e.writeImageOwnerMetadata(rel, ownerID, ownerName); err != nil {
		_ = os.Remove(filePath)
		return "", fmt.Errorf("写入图片元数据失败: %w", err)
	}
	if baseURL == "" {
		baseURL = e.Config.BaseURL()
	}
	return strings.TrimRight(baseURL, "/") + "/images/" + filepath.ToSlash(rel), nil
}

func imageFileExtension(outputFormat string) string {
	if NormalizeImageOutputFormat(outputFormat) == "jpeg" {
		return "jpg"
	}
	return NormalizeImageOutputFormat(outputFormat)
}

func encodeImageBytes(data []byte, options ImageOutputOptions) ([]byte, error) {
	format := NormalizeImageOutputFormat(options.Format)
	if format == "png" {
		return data, nil
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	switch format {
	case "jpeg":
		quality := 90
		if options.Compression != nil {
			quality = 100 - *options.Compression
			if quality < 1 {
				quality = 1
			} else if quality > 100 {
				quality = 100
			}
		}
		if err := jpeg.Encode(&buf, flattenAlpha(img), &jpeg.Options{Quality: quality}); err != nil {
			return nil, err
		}
	case "webp":
		if err := nativewebp.Encode(&buf, img, nil); err != nil {
			return nil, err
		}
	default:
		if err := png.Encode(&buf, img); err != nil {
			return nil, err
		}
	}
	return buf.Bytes(), nil
}

func flattenAlpha(img image.Image) image.Image {
	bounds := img.Bounds()
	out := image.NewRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			alpha := int(a)
			out.Set(x, y, color.RGBA{
				R: blendOverWhite(int(r), alpha),
				G: blendOverWhite(int(g), alpha),
				B: blendOverWhite(int(b), alpha),
				A: 255,
			})
		}
	}
	return out
}

func blendOverWhite(channel, alpha int) uint8 {
	value := (channel*alpha + 0xffff*(0xffff-alpha)) / 0xffff
	return uint8(value >> 8)
}

func (e *Engine) writeImageOwnerMetadata(rel, ownerID, ownerName string) error {
	ownerID = strings.TrimSpace(ownerID)
	ownerName = strings.TrimSpace(ownerName)
	if e == nil || e.Config == nil || ownerID == "" {
		return nil
	}
	value := map[string]any{"owner_id": ownerID, "updated_at": util.NowISO()}
	if ownerName != "" {
		value["owner_name"] = ownerName
	}
	if e.Storage != nil {
		if err := e.Storage.SaveJSONDocument(imageOwnerDocumentName(rel), value); err != nil {
			return err
		}
		return nil
	}
	metaPath := filepath.Join(e.Config.ImageMetadataDir(), filepath.FromSlash(filepath.ToSlash(rel))+".json")
	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	tmpPath := metaPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, metaPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

func imageOwnerDocumentName(rel string) string {
	return "image_metadata/" + filepath.ToSlash(rel) + ".json"
}
