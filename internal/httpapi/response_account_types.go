package httpapi

import (
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

type accountRefreshErrorResponse struct {
	AccessToken string `json:"access_token,omitempty"`
	AccountID   string `json:"account_id,omitempty"`
	Error       string `json:"error"`
}

type accountPayloadResponse struct {
	Added     *int                           `json:"added,omitempty"`
	Skipped   *int                           `json:"skipped,omitempty"`
	Removed   *int                           `json:"removed,omitempty"`
	Refreshed *int                           `json:"refreshed,omitempty"`
	Item      *service.AccountPublic         `json:"item,omitempty"`
	Items     []service.AccountPublic        `json:"items"`
	Errors    *[]accountRefreshErrorResponse `json:"errors,omitempty"`
	Source    *string                        `json:"source,omitempty"`
}

func accountPayloadResponseFromMap(payload map[string]any) accountPayloadResponse {
	response := accountPayloadResponse{}
	if items, ok := payload["items"].([]service.AccountPublic); ok {
		response.Items = items
	} else {
		response.Items = service.AccountPublicListFromMaps(util.AsMapSlice(payload["items"]))
	}
	if response.Items == nil {
		response.Items = []service.AccountPublic{}
	}
	if item, ok := payload["item"].(service.AccountPublic); ok {
		response.Item = &item
	} else if item, ok := payload["item"].(map[string]any); ok {
		public := service.AccountPublicFromMap(item)
		response.Item = &public
	}
	setOptionalInt := func(key string, target **int) {
		if _, ok := payload[key]; !ok {
			return
		}
		value := util.ToInt(payload[key], 0)
		*target = &value
	}
	setOptionalInt("added", &response.Added)
	setOptionalInt("skipped", &response.Skipped)
	setOptionalInt("removed", &response.Removed)
	setOptionalInt("refreshed", &response.Refreshed)
	if raw, ok := payload["errors"].([]map[string]string); ok {
		items := make([]accountRefreshErrorResponse, 0, len(raw))
		for _, item := range raw {
			items = append(items, accountRefreshErrorResponse{
				AccessToken: item["access_token"], AccountID: item["account_id"], Error: item["error"],
			})
		}
		response.Errors = &items
	}
	if _, ok := payload["source"]; ok {
		value := util.Clean(payload["source"])
		response.Source = &value
	}
	return response
}
