package backend

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
)

const defaultPOWScript = "https://chatgpt.com/backend-api/sentinel/sdk.js"

var scriptSrcRE = regexp.MustCompile(`(?is)<script[^>]+src=["']([^"']+)["']`)

func parsePOWResources(html string) ([]string, string) {
	matches := scriptSrcRE.FindAllStringSubmatch(html, -1)
	sources := make([]string, 0, len(matches))
	dataBuild := ""
	for _, match := range matches {
		src := match[1]
		sources = append(sources, src)
		if dataBuild == "" {
			if hit := regexp.MustCompile(`c/[^/]*/_`).FindString(src); hit != "" {
				dataBuild = hit
			}
		}
	}
	if len(sources) == 0 {
		sources = []string{defaultPOWScript}
	}
	if dataBuild == "" {
		if match := regexp.MustCompile(`<html[^>]*data-build=["']([^"']*)["']`).FindStringSubmatch(html); len(match) > 1 {
			dataBuild = match[1]
		}
	}
	return sources, dataBuild
}

// decodeRequirementsConfig validates the browser-generated format before using it
// as proof input. It is never rebuilt from random Go browser properties.
func decodeRequirementsConfig(p string) ([]any, error) {
	if !strings.HasPrefix(p, "gAAAAAC") || len(p) > 16384 {
		return nil, fmt.Errorf("invalid requirements token")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(p, "gAAAAAC"))
	if err != nil {
		return nil, fmt.Errorf("invalid requirements encoding")
	}
	var config []any
	if err := json.Unmarshal(raw, &config); err != nil || len(config) != 25 {
		return nil, fmt.Errorf("requirements must contain 25 fields")
	}
	return config, nil
}

// fnv1aAvalanche matches JavaScript charCodeAt (UTF-16), including non-ASCII seeds.
func fnv1aAvalanche(text string) uint32 {
	h := uint32(2166136261)
	for _, ch := range utf16.Encode([]rune(text)) {
		h ^= uint32(ch)
		h *= 16777619
	}
	h ^= h >> 16
	h *= 2246822507
	h ^= h >> 13
	h *= 3266489909
	return h ^ (h >> 16)
}

func buildProofToken(ctx context.Context, seed, difficulty, sourceP string) (string, error) {
	if seed == "" || len(seed) > 4096 || len(difficulty) < 1 || len(difficulty) > 8 {
		return "", fmt.Errorf("invalid proof challenge")
	}
	for _, ch := range difficulty {
		if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f') {
			return "", fmt.Errorf("invalid proof difficulty")
		}
	}
	config, err := decodeRequirementsConfig(sourceP)
	if err != nil {
		return "", err
	}
	started := time.Now()
	for i := 0; i < 500000; i++ {
		if i%256 == 0 {
			if err := ctx.Err(); err != nil {
				return "", err
			}
		}
		config[3], config[9] = i, time.Since(started).Milliseconds()
		var buf bytes.Buffer
		encoder := json.NewEncoder(&buf)
		encoder.SetEscapeHTML(false)
		if err := encoder.Encode(config); err != nil {
			return "", fmt.Errorf("encode proof: %w", err)
		}
		payload := base64.StdEncoding.EncodeToString(bytes.TrimSuffix(buf.Bytes(), []byte("\n")))
		digest := fmt.Sprintf("%08x", fnv1aAvalanche(seed+payload))
		if digest[:len(difficulty)] <= difficulty {
			return "gAAAAAB" + payload + "~S", nil
		}
	}
	return "", fmt.Errorf("proof attempt budget exhausted")
}
