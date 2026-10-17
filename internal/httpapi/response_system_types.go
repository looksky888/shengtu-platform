package httpapi

import (
	"chatgpt2api/internal/hostupdate"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/version"
)

type hostUpdaterStatusResponse struct {
	Configured bool              `json:"configured"`
	Connected  bool              `json:"connected"`
	Reason     string            `json:"reason,omitempty"`
	State      *hostupdate.State `json:"state,omitempty"`
}

type hostUpdaterPreflightResponse struct {
	Configured bool                       `json:"configured"`
	Connected  bool                       `json:"connected"`
	Result     hostupdate.PreflightResult `json:"result"`
}

type hostUpdaterUpdateResponse struct {
	Configured bool                    `json:"configured"`
	Connected  bool                    `json:"connected"`
	Result     hostupdate.UpdateResult `json:"result"`
}

type healthDeployment struct {
	SingleWriterRequired bool   `json:"single_writer_required"`
	Note                 string `json:"note"`
}

type healthStorage struct {
	AccountPoolReady bool `json:"account_pool_ready"`
	CreditsReady     bool `json:"credits_ready"`
}

type healthFeaturesV35 struct {
	ICloud          bool   `json:"icloud"`
	GrokNative      bool   `json:"grok_native"`
	GrokRegister    bool   `json:"grok_register"`
	RegisterBackend string `json:"register_backend"`
	ICloudBaseURL   string `json:"icloud_base_url"`
	GrokRuntimeURL  string `json:"grok_runtime_url"`
}

type applicationHealthResponse struct {
	Status             string                                   `json:"status"`
	Version            string                                   `json:"version"`
	Deployment         healthDeployment                         `json:"deployment"`
	Storage            healthStorage                            `json:"storage"`
	DegradedReasons    []string                                 `json:"degraded_reasons,omitempty"`
	AccountPool        *service.AccountPoolHealthSnapshotPublic `json:"account_pool,omitempty"`
	ImageProxy         *ImageProxyHealthSnapshot                `json:"image_proxy,omitempty"`
	TaskExecutors      *service.ImageTaskExecutorsPublic        `json:"task_executors,omitempty"`
	TaskStageDurations *service.ImageTaskStageDurationsPublic   `json:"task_stage_durations,omitempty"`
	MediaStorage       *service.MediaStorageMetrics             `json:"media_storage,omitempty"`
	PaymentCallbacks   *service.PaymentCallbackHealthPublic     `json:"payment_callbacks,omitempty"`
	FeaturesV35        *healthFeaturesV35                       `json:"features_v35,omitempty"`
}

type applicationReadinessResponse struct {
	Status        string                         `json:"status"`
	Version       string                         `json:"version"`
	SchemaVersion int                            `json:"schema_version"`
	Reasons       []string                       `json:"reasons,omitempty"`
	Storage       healthStorage                  `json:"storage"`
	Tasks         service.ImageTaskDrainSnapshot `json:"tasks"`
	Requests      updateRequestDrainSnapshot     `json:"requests"`
}

type systemVersionResponse struct {
	Version      string              `json:"version"`
	VersionInfo  version.Info        `json:"version_info"`
	UpdateStatus *service.UpdateInfo `json:"update_status"`
}

type systemActionResponse struct {
	Message     string `json:"message"`
	NeedRestart bool   `json:"need_restart"`
	Note        string `json:"note,omitempty"`
}

type systemTaskDrainResponse struct {
	Message  string                         `json:"message"`
	Drained  bool                           `json:"drained"`
	Tasks    service.ImageTaskDrainSnapshot `json:"tasks"`
	Requests updateRequestDrainSnapshot     `json:"requests"`
}

type modelCatalogSource struct {
	Chat  string `json:"chat"`
	Image string `json:"image"`
	Grok  string `json:"grok"`
}

type modelCatalogResponse struct {
	Object               string                            `json:"object"`
	ChatModels           []string                          `json:"chat_models"`
	ImageModels          []string                          `json:"image_models"`
	ImageEditModels      []string                          `json:"image_edit_models"`
	VideoModels          []string                          `json:"video_models"`
	AllModels            []string                          `json:"all_models"`
	Source               modelCatalogSource                `json:"source"`
	OpenAIModelsEndpoint string                            `json:"openai_models_endpoint"`
	ImageChannelModels   []service.ImageChannelModelPublic `json:"image_channel_models,omitempty"`
}

type iCloudBridgeStatusResponse struct {
	Enabled    bool   `json:"enabled"`
	Reachable  bool   `json:"reachable"`
	BaseURL    string `json:"base_url"`
	StatusCode *int   `json:"status_code,omitempty"`
	Error      string `json:"error"`
}
