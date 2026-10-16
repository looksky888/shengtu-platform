package protocol

import (
	"context"
	"encoding/base64"
	"time"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/util"
)

func (e *Engine) conversationImageResultOutput(ctx context.Context, client *backend.Client, request ConversationRequest, conversationID string, fileIDs, sedimentIDs []string, index, total int, poll bool) (ImageOutput, bool, error) {
	imageURLs := client.ResolveConversationImageURLs(ctx, conversationID, fileIDs, sedimentIDs, poll)
	if len(imageURLs) == 0 {
		return ImageOutput{}, false, nil
	}
	bytesItems, err := client.DownloadImageBytes(ctx, imageURLs)
	if err != nil {
		return ImageOutput{}, false, err
	}
	var imageItems []map[string]any
	for _, data := range bytesItems {
		imageItems = append(imageItems, map[string]any{
			"b64_json":      base64.StdEncoding.EncodeToString(data),
			"output_format": NormalizeImageOutputFormat(request.OutputFormat),
		})
	}
	created := time.Now().Unix()
	result, formatErr := e.FormatImageResultWithOptions(
		imageItems,
		request.Prompt,
		request.ResponseFormat,
		request.BaseURL,
		request.OwnerID,
		request.OwnerName,
		created,
		"",
		ImageOutputOptions{Format: request.OutputFormat, Compression: request.OutputCompression},
	)
	if formatErr != nil {
		return ImageOutput{}, false, formatErr
	}
	data := util.AsMapSlice(result["data"])
	if len(data) == 0 {
		return ImageOutput{}, false, nil
	}
	return ImageOutput{Kind: "result", Model: request.Model, Index: index, Total: total, Created: created, Data: data}, true, nil
}
