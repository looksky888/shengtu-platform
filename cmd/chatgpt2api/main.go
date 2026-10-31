package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"chatgpt2api/internal/httpapi"
	"chatgpt2api/internal/version"
)

type cliOptions struct {
	showHelp    bool
	showVersion bool
}

func main() {
	options, err := parseCLI(os.Args[1:], os.Stdout)
	if err != nil {
		log.Fatalf("invalid arguments: %v", err)
	}
	if options.showHelp {
		return
	}
	if options.showVersion {
		fmt.Fprintln(os.Stdout, version.Get())
		return
	}

	publicAddr, err := publicListenAddr()
	if err != nil {
		log.Fatalf("invalid public listen address: %v", err)
	}
	internalAddr, err := internalListenAddr()
	if err != nil {
		log.Fatalf("invalid internal listen address: %v", err)
	}

	app, err := httpapi.NewApp()
	if err != nil {
		log.Fatalf("init app: %v", err)
	}

	logger := app.Logger()
	servers := []namedServer{{
		name: "public",
		server: &http.Server{
			Addr:              publicAddr,
			Handler:           app.Handler(),
			ReadHeaderTimeout: 30 * time.Second,
			IdleTimeout:       120 * time.Second,
		},
	}}
	if internalAddr != "" {
		internalHandler, err := app.InternalHandler()
		if err != nil {
			if closeErr := app.Close(); closeErr != nil {
				log.Printf("app shutdown after internal server init failure: %v", closeErr)
			}
			log.Fatalf("init internal server: %v", err)
		}
		servers = append(servers, namedServer{
			name: "internal",
			server: &http.Server{
				Addr:              internalAddr,
				Handler:           internalHandler,
				ReadHeaderTimeout: 30 * time.Second,
				IdleTimeout:       120 * time.Second,
			},
		})
	}

	serverFailures := make(chan serverFailure, len(servers))
	for _, item := range servers {
		item := item
		item.server.RegisterOnShutdown(app.NotifyServerShutdown)
		go func() {
			logger.Info("starting server", "name", item.name, "addr", item.server.Addr)
			if err := item.server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				serverFailures <- serverFailure{name: item.name, err: err}
			}
		}()
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	var serveErr error
	select {
	case <-stop:
	case <-app.ShutdownRequested():
		logger.Info("graceful restart requested")
	case failure := <-serverFailures:
		logger.Error("listen failed", "name", failure.name, "error", failure.err)
		serveErr = fmt.Errorf("%s server: %w", failure.name, failure.err)
	}

	// Default 120s so in-flight image tasks (often 60–150s per attempt) can finish.
	// Override: CHATGPT2API_SHUTDOWN_TIMEOUT_SECONDS (15–600).
	shutdownTimeout := 120 * time.Second
	if v := strings.TrimSpace(os.Getenv("CHATGPT2API_SHUTDOWN_TIMEOUT_SECONDS")); v != "" {
		if sec, err := strconv.Atoi(v); err == nil {
			if sec < 15 {
				sec = 15
			}
			if sec > 600 {
				sec = 600
			}
			shutdownTimeout = time.Duration(sec) * time.Second
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	logger.Info("shutting down servers", "timeout_seconds", int(shutdownTimeout.Seconds()))
	for _, item := range servers {
		if err := item.server.Shutdown(ctx); err != nil {
			logger.Error("server shutdown failed", "name", item.name, "error", err)
		}
	}
	if err := app.Close(); err != nil {
		log.Printf("app shutdown failed: %v", err)
	}
	if serveErr != nil {
		log.Fatalf("server stopped: %v", serveErr)
	}
}

func parseCLI(args []string, output io.Writer) (cliOptions, error) {
	flags := flag.NewFlagSet("chatgpt2api", flag.ContinueOnError)
	flags.SetOutput(output)
	showVersion := flags.Bool("version", false, "print version and exit")
	flags.Usage = func() {
		fmt.Fprintln(output, "Usage: chatgpt2api [--version]")
		fmt.Fprintln(output, "Environment: PORT sets the public listen port (default 8000);")
		fmt.Fprintln(output, "  CHATGPT2API_PORT is used when PORT is unset and CHATGPT2API_BIND_ADDR restricts the interface.")
		flags.PrintDefaults()
	}
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return cliOptions{showHelp: true}, nil
		}
		return cliOptions{}, err
	}
	if flags.NArg() > 0 {
		return cliOptions{}, fmt.Errorf("unexpected positional arguments: %s", strings.Join(flags.Args(), " "))
	}
	return cliOptions{showVersion: *showVersion}, nil
}

// publicListenAddr resolves the public listener. PORT wins because the container
// image sets it; CHATGPT2API_PORT is the documented .env name for running the
// binary directly. CHATGPT2API_BIND_ADDR restricts the interface: empty means
// all interfaces, which is what the image relies on for its published port.
func publicListenAddr() (string, error) {
	value, source := strings.TrimSpace(os.Getenv("PORT")), "PORT"
	if value == "" {
		value, source = strings.TrimSpace(os.Getenv("CHATGPT2API_PORT")), "CHATGPT2API_PORT"
	}
	if value == "" {
		value, source = "8000", "PORT"
	}
	port, err := validPort(value)
	if err != nil {
		return "", fmt.Errorf("%s %q: %w", source, value, err)
	}
	host := strings.TrimSpace(os.Getenv("CHATGPT2API_BIND_ADDR"))
	if host == "" {
		return fmt.Sprintf(":%d", port), nil
	}
	return net.JoinHostPort(host, strconv.Itoa(port)), nil
}

func internalListenAddr() (string, error) {
	value := strings.TrimSpace(os.Getenv("CHATGPT2API_INTERNAL_LISTEN_ADDR"))
	if value == "" {
		return "", nil
	}
	host, portText, err := net.SplitHostPort(value)
	if err != nil {
		return "", fmt.Errorf("CHATGPT2API_INTERNAL_LISTEN_ADDR %q: %w", value, err)
	}
	port, err := validPort(portText)
	if err != nil {
		return "", fmt.Errorf("CHATGPT2API_INTERNAL_LISTEN_ADDR %q: %w", value, err)
	}
	return net.JoinHostPort(host, strconv.Itoa(port)), nil
}

func validPort(value string) (int, error) {
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		return 0, fmt.Errorf("port must be an integer from 1 to 65535")
	}
	return port, nil
}

type namedServer struct {
	name   string
	server *http.Server
}

type serverFailure struct {
	name string
	err  error
}
