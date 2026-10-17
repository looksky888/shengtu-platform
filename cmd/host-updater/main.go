package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"chatgpt2api/internal/hostupdate"
)

func main() {
	token := strings.TrimSpace(os.Getenv("SHENGTU_UPDATER_TOKEN"))
	if len(token) < 32 {
		log.Fatal("SHENGTU_UPDATER_TOKEN must contain at least 32 characters")
	}
	installDir := envOr("SHENGTU_UPDATER_INSTALL_DIR", "/workspace")
	stateDir := envOr("SHENGTU_UPDATER_STATE_DIR", filepath.Join(installDir, "data", "host-updater"))
	backupDir := envOr("SHENGTU_UPDATER_BACKUP_DIR", filepath.Join(installDir, "data", "update-backups"))
	manager, err := hostupdate.NewManager(hostupdate.Options{
		StateDir: stateDir, InstallDir: installDir, BackupDir: backupDir,
		ComposeFiles:         splitList(envOr("SHENGTU_UPDATER_COMPOSE_FILES", "docker-compose.yml")),
		ReadinessURL:         envOr("SHENGTU_UPDATER_READINESS_URL", "http://127.0.0.1:3004/ready"),
		AppControlURL:        envOr("SHENGTU_UPDATER_APP_CONTROL_URL", "http://127.0.0.1:8092"),
		AppControlToken:      token,
		DataDir:              envOr("SHENGTU_UPDATER_DATA_DIR", filepath.Join(installDir, "data")),
		ComposeProject:       envOr("SHENGTU_UPDATER_COMPOSE_PROJECT", "shengtu"),
		AppService:           envOr("SHENGTU_UPDATER_APP_SERVICE", "app"),
		ManagedOverride:      strings.TrimSpace(os.Getenv("SHENGTU_UPDATER_MANAGED_OVERRIDE")),
		Repository:           envOr("SHENGTU_UPDATER_REPOSITORY", "looksky888/shengtu-platform"),
		GitHubToken:          strings.TrimSpace(os.Getenv("SHENGTU_UPDATER_GITHUB_TOKEN")),
		Platform:             envOr("SHENGTU_UPDATER_PLATFORM", "linux/amd64"),
		MinimumFree:          envUint64("SHENGTU_UPDATER_MIN_FREE_BYTES", 2<<30),
		CommandTimeout:       time.Duration(envUint64("SHENGTU_UPDATER_CHECK_TIMEOUT_SECONDS", 10)) * time.Second,
		DrainTimeout:         time.Duration(envUint64("SHENGTU_UPDATER_DRAIN_TIMEOUT_SECONDS", 900)) * time.Second,
		UpdateTimeout:        time.Duration(envUint64("SHENGTU_UPDATER_UPDATE_TIMEOUT_SECONDS", 1800)) * time.Second,
		ReadinessInterval:    time.Duration(envUint64("SHENGTU_UPDATER_READINESS_INTERVAL_SECONDS", 2)) * time.Second,
		ReadinessStableCount: int(envUint64("SHENGTU_UPDATER_READINESS_STABLE_COUNT", 3)),
	})
	if err != nil {
		log.Fatalf("initialize host updater: %v", err)
	}
	manager.RecoverInterrupted()
	listener, cleanup, err := listenUpdater()
	if err != nil {
		log.Fatalf("listen host updater: %v", err)
	}
	defer cleanup()
	server := &http.Server{Handler: hostupdate.NewHandler(manager, token), ReadHeaderTimeout: 5 * time.Second}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	log.Printf("host updater listening on %s", listener.Addr())
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("serve host updater: %v", err)
	}
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envUint64(name string, fallback uint64) uint64 {
	value, err := strconv.ParseUint(strings.TrimSpace(os.Getenv(name)), 10, 64)
	if err != nil || value == 0 {
		return fallback
	}
	return value
}

func splitList(value string) []string {
	items := []string{}
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			items = append(items, item)
		}
	}
	return items
}

