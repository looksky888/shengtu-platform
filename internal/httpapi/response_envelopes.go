package httpapi

type okResponse struct {
	OK bool `json:"ok"`
}

type keyResponse struct {
	Key string `json:"key"`
}

type sentResponse struct {
	Sent bool `json:"sent"`
}

type deletedResponse struct {
	Deleted bool `json:"deleted"`
}

type itemResponse[T any] struct {
	Item T `json:"item"`
}

type itemsResponse[T any] struct {
	Items []T `json:"items"`
}

type itemListResponse[T any] struct {
	Item  T   `json:"item"`
	Items []T `json:"items"`
}

type itemKeyListResponse[T any] struct {
	Item  T      `json:"item"`
	Key   string `json:"key"`
	Items []T    `json:"items"`
}

type settingsResponse[T any] struct {
	Settings T `json:"settings"`
}

type statsResponse[T any] struct {
	Stats T `json:"stats"`
}

type registerResponse[T any] struct {
	Register T `json:"register"`
}

type poolsResponse[T any] struct {
	Pools []T `json:"pools"`
}

type poolListResponse[T any] struct {
	Pool  T   `json:"pool"`
	Pools []T `json:"pools"`
}

type poolFilesResponse[T any] struct {
	PoolID string `json:"pool_id"`
	Files  []T    `json:"files"`
}

type importJobResponse[T any] struct {
	ImportJob T `json:"import_job"`
}

type itemsTotalResponse[T any] struct {
	Items []T `json:"items"`
	Total int `json:"total"`
}

type cursorPageResponse[T any] struct {
	Items      []T    `json:"items"`
	Total      int    `json:"total"`
	HasMore    bool   `json:"has_more"`
	NextCursor string `json:"next_cursor"`
	Limit      int    `json:"limit"`
}

type scopedCursorPageResponse[T any] struct {
	Items      []T    `json:"items"`
	Total      int    `json:"total"`
	HasMore    bool   `json:"has_more"`
	NextCursor string `json:"next_cursor"`
	Limit      int    `json:"limit"`
	Scope      string `json:"scope"`
}

type tokensResponse struct {
	Tokens []string `json:"tokens"`
}

type configResponse[T any] struct {
	Config T `json:"config"`
}

type healthResponse[T any] struct {
	Health T `json:"health"`
}

type modelsResponse[T any] struct {
	Models []T `json:"models"`
}

type imageURLResponse struct {
	ImageURL string `json:"image_url"`
}

type versionResponse struct {
	Version string `json:"version"`
}

type deletedIDResponse struct {
	DeletedID string `json:"deleted_id"`
}

type resultResponse[T any] struct {
	Result T `json:"result"`
}

type proxyResponse[T any] struct {
	Proxy T `json:"proxy"`
}

type governanceResponse[T any] struct {
	Governance T `json:"governance"`
}
