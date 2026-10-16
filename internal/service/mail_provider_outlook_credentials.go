package service

import (
	"chatgpt2api/internal/util"
	"strings"
)

type outlookCredential struct {
	Email        string
	Password     string
	ClientID     string
	RefreshToken string
}

func parseOutlookCredentials(text string) []outlookCredential {
	credentials := make([]outlookCredential, 0)
	seen := map[string]struct{}{}
	for _, rawLine := range strings.Split(text, "\n") {
		line := cleanOutlookValue(rawLine)
		if line == "" || !strings.Contains(line, "----") {
			continue
		}
		parts := strings.SplitN(line, "----", 4)
		if len(parts) != 4 {
			continue
		}
		for i := range parts {
			parts[i] = cleanOutlookValue(parts[i])
		}
		email, password, clientID, refreshToken := parts[0], parts[1], parts[2], parts[3]
		if !strings.Contains(email, "@") || clientID == "" || refreshToken == "" {
			continue
		}
		key := strings.ToLower(email)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		credentials = append(credentials, outlookCredential{
			Email:        email,
			Password:     password,
			ClientID:     clientID,
			RefreshToken: refreshToken,
		})
	}
	return credentials
}

func normalizeOutlookPool(value any) []outlookCredential {
	switch typed := value.(type) {
	case string:
		return parseOutlookCredentials(typed)
	case []any:
		out := make([]outlookCredential, 0, len(typed))
		for _, item := range typed {
			switch row := item.(type) {
			case string:
				out = append(out, parseOutlookCredentials(row)...)
			case map[string]any:
				email := cleanOutlookValue(firstNonEmpty(util.Clean(row["email"]), util.Clean(row["address"])))
				clientID := cleanOutlookValue(util.Clean(row["client_id"]))
				refreshToken := cleanOutlookValue(util.Clean(row["refresh_token"]))
				if strings.Contains(email, "@") && clientID != "" && refreshToken != "" {
					out = append(out, outlookCredential{
						Email:        email,
						Password:     cleanOutlookValue(util.Clean(row["password"])),
						ClientID:     clientID,
						RefreshToken: refreshToken,
					})
				}
			}
		}
		return dedupeOutlookCredentials(out)
	case []map[string]any:
		raw := make([]any, 0, len(typed))
		for _, item := range typed {
			raw = append(raw, item)
		}
		return normalizeOutlookPool(raw)
	default:
		return nil
	}
}

func dedupeOutlookCredentials(items []outlookCredential) []outlookCredential {
	seen := map[string]struct{}{}
	out := make([]outlookCredential, 0, len(items))
	for _, item := range items {
		key := strings.ToLower(strings.TrimSpace(item.Email))
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	return out
}

func serializeOutlookPool(credentials []outlookCredential) string {
	lines := make([]string, 0, len(credentials))
	for _, credential := range credentials {
		lines = append(lines, credential.Email+"----"+credential.Password+"----"+credential.ClientID+"----"+credential.RefreshToken)
	}
	return strings.Join(lines, "\n")
}

func mergeOutlookPool(oldText, newText string) string {
	merged := map[string]outlookCredential{}
	order := make([]string, 0)
	for _, credential := range parseOutlookCredentials(oldText) {
		key := strings.ToLower(strings.TrimSpace(credential.Email))
		if _, ok := merged[key]; !ok {
			order = append(order, key)
		}
		merged[key] = credential
	}
	for _, credential := range parseOutlookCredentials(newText) {
		key := strings.ToLower(strings.TrimSpace(credential.Email))
		if _, ok := merged[key]; !ok {
			order = append(order, key)
		}
		merged[key] = credential
	}
	out := make([]outlookCredential, 0, len(order))
	for _, key := range order {
		out = append(out, merged[key])
	}
	return serializeOutlookPool(out)
}

func cleanOutlookValue(value string) string {
	value = strings.ReplaceAll(value, "\ufeff", "")
	value = strings.ReplaceAll(value, "\u00a0", " ")
	return strings.TrimSpace(value)
}
