package httpapi

import (
	"chatgpt2api/internal/config"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/version"
)

func newUpdateService(cfg *config.Store) *service.UpdateService {
	return service.NewUpdateService(service.UpdateOptions{
		CurrentVersion: version.Get(),
		BuildType:      version.GetBuildType(),
		Deployment:     version.GetDeployment(),
		Repo:           cfg.UpdateRepo(),
		ProxyURL:       cfg.UpdateProxyURL(),
		GitHubToken:    cfg.UpdateGitHubToken(),
	})
}
