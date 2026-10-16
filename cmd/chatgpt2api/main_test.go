package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestParseCLI(t *testing.T) {
	tests := []struct {
		name        string
		args        []string
		wantHelp    bool
		wantVersion bool
		wantErr     string
	}{
		{name: "server mode"},
		{name: "help short", args: []string{"-h"}, wantHelp: true},
		{name: "help long", args: []string{"--help"}, wantHelp: true},
		{name: "version", args: []string{"--version"}, wantVersion: true},
		{name: "unknown option", args: []string{"--unknown"}, wantErr: "flag provided but not defined"},
		{name: "positional argument", args: []string{"serve"}, wantErr: "unexpected positional arguments"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var output bytes.Buffer
			got, err := parseCLI(tt.args, &output)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("parseCLI() error = %v, want substring %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseCLI() error = %v", err)
			}
			if got.showHelp != tt.wantHelp || got.showVersion != tt.wantVersion {
				t.Fatalf("parseCLI() = %+v, want help=%v version=%v", got, tt.wantHelp, tt.wantVersion)
			}
			if tt.wantHelp && !strings.Contains(output.String(), "Usage: chatgpt2api") {
				t.Fatalf("help output = %q", output.String())
			}
		})
	}
}

func TestPublicListenAddr(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    string
		wantErr bool
	}{
		{name: "default", want: ":8000"},
		{name: "configured", value: " 3004 ", want: ":3004"},
		{name: "not numeric", value: "http", wantErr: true},
		{name: "zero", value: "0", wantErr: true},
		{name: "too high", value: "65536", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PORT", tt.value)
			got, err := publicListenAddr()
			if (err != nil) != tt.wantErr {
				t.Fatalf("publicListenAddr() error = %v, wantErr=%v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("publicListenAddr() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestInternalListenAddr(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    string
		wantErr bool
	}{
		{name: "disabled"},
		{name: "all interfaces", value: ":8092", want: ":8092"},
		{name: "loopback", value: "127.0.0.1:8092", want: "127.0.0.1:8092"},
		{name: "ipv6", value: "[::1]:8092", want: "[::1]:8092"},
		{name: "missing port", value: "127.0.0.1", wantErr: true},
		{name: "bad port", value: ":nope", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("CHATGPT2API_INTERNAL_LISTEN_ADDR", tt.value)
			got, err := internalListenAddr()
			if (err != nil) != tt.wantErr {
				t.Fatalf("internalListenAddr() error = %v, wantErr=%v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("internalListenAddr() = %q, want %q", got, tt.want)
			}
		})
	}
}
