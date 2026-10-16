package service

const (
	ImageChannelTypeAccountPool      = "account_pool"
	ImageChannelTypeOpenAICompatible = "openai_compatible"
	ImageChannelTypeGrokRuntime      = "grok_runtime"

	ImageCapabilityGenerate = "generate"
	ImageCapabilityEdit     = "edit"
)

type ImageChannel struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Alias            string `json:"alias,omitempty"`
	Type             string `json:"type"`
	BaseURL          string `json:"base_url,omitempty"`
	APIKeyCiphertext string `json:"api_key_ciphertext,omitempty"`
	Enabled          bool   `json:"enabled"`
	System           bool   `json:"system,omitempty"`
	Sort             int    `json:"sort"`
	MaxConcurrency   int    `json:"max_concurrency"`
	TimeoutSeconds   int    `json:"timeout_seconds"`
	MaxRetries       int    `json:"max_retries"`
	DownloadURLs     bool   `json:"download_urls"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
}

type ImageChannelModel struct {
	ID            string         `json:"id"`
	ChannelID     string         `json:"channel_id"`
	DisplayName   string         `json:"display_name"`
	UpstreamModel string         `json:"upstream_model"`
	Capabilities  []string       `json:"capabilities"`
	Resolutions   []string       `json:"resolutions,omitempty"`
	Formats       []string       `json:"formats,omitempty"`
	CreditCost    int            `json:"credit_cost"`
	CreditCosts   map[string]int `json:"credit_costs,omitempty"`
	Enabled       bool           `json:"enabled"`
	Sort          int            `json:"sort"`
	CreatedAt     string         `json:"created_at"`
	UpdatedAt     string         `json:"updated_at"`
}

type ImageChannelInput struct {
	Name           string `json:"name"`
	Alias          string `json:"alias"`
	Type           string `json:"type"`
	BaseURL        string `json:"base_url"`
	APIKey         string `json:"api_key"`
	ClearAPIKey    bool   `json:"clear_api_key"`
	Enabled        bool   `json:"enabled"`
	Sort           int    `json:"sort"`
	MaxConcurrency int    `json:"max_concurrency"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	MaxRetries     int    `json:"max_retries"`
	DownloadURLs   bool   `json:"download_urls"`
}

type ImageChannelModelInput struct {
	DisplayName   string         `json:"display_name"`
	UpstreamModel string         `json:"upstream_model"`
	Capabilities  []string       `json:"capabilities"`
	Resolutions   []string       `json:"resolutions"`
	Formats       []string       `json:"formats"`
	CreditCost    int            `json:"credit_cost"`
	CreditCosts   map[string]int `json:"credit_costs,omitempty"`
	Enabled       bool           `json:"enabled"`
	Sort          int            `json:"sort"`
}

type ImageChannelAdmin struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Alias            string `json:"alias,omitempty"`
	Type             string `json:"type"`
	BaseURL          string `json:"base_url,omitempty"`
	Enabled          bool   `json:"enabled"`
	System           bool   `json:"system"`
	Sort             int    `json:"sort"`
	MaxConcurrency   int    `json:"max_concurrency"`
	TimeoutSeconds   int    `json:"timeout_seconds"`
	MaxRetries       int    `json:"max_retries"`
	DownloadURLs     bool   `json:"download_urls"`
	APIKeyConfigured bool   `json:"api_key_configured"`
	APIKeyMasked     string `json:"api_key_masked,omitempty"`
	ModelCount       int    `json:"model_count"`
	EnabledModels    int    `json:"enabled_models"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
}

type ImageChannelModelPublic struct {
	ID            string         `json:"id"`
	ChannelID     string         `json:"channel_id"`
	ChannelName   string         `json:"channel_name"`
	ChannelAlias  string         `json:"channel_alias,omitempty"`
	ChannelType   string         `json:"channel_type"`
	DisplayName   string         `json:"display_name"`
	UpstreamModel string         `json:"upstream_model"`
	Capabilities  []string       `json:"capabilities"`
	Resolutions   []string       `json:"resolutions,omitempty"`
	Formats       []string       `json:"formats,omitempty"`
	CreditCost    int            `json:"credit_cost"`
	CreditCosts   map[string]int `json:"credit_costs,omitempty"`
	Sort          int            `json:"sort"`
	ChannelSort   int            `json:"channel_sort"`
}

type ResolvedImageChannelModel struct {
	ImageChannelModelPublic
	BaseURL        string
	APIKey         string
	MaxConcurrency int
	TimeoutSeconds int
	MaxRetries     int
	DownloadURLs   bool
}

type ResolvedImageChannel struct {
	ID             string
	Name           string
	Type           string
	BaseURL        string
	APIKey         string
	Enabled        bool
	MaxConcurrency int
	TimeoutSeconds int
	MaxRetries     int
	DownloadURLs   bool
}

type ImageChannelLegacyConfig struct {
	ProxyEnabled    bool
	ProxyBaseURL    string
	ProxyAPIKey     string
	ProxyModel      string
	ProxyModels     []string
	TimeoutSeconds  int
	MaxRetries      int
	DownloadURLs    bool
	GPTModelCosts   map[string]int
	GrokImageCost1K int
	GrokImageCost2K int
	MaxConcurrency  int
}

type imageChannelState struct {
	Version  int                 `json:"version"`
	Channels []ImageChannel      `json:"channels"`
	Models   []ImageChannelModel `json:"models"`
}
