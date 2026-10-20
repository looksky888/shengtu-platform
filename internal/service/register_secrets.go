package service

import (
	"sort"
	"strings"

	"chatgpt2api/internal/util"
)

// Register credentials (mail provider keys, Cloudflare clearance cookies) are
// never returned by the API. The opaque snapshot blanks every secret field and
// marks it with "<field>_configured": true, so the UI can render "已保存，留空保持不变".
//
// Because the settings UI posts the whole document back, the write path carries
// the stored value over whenever an incoming secret is blank — a redacted
// load/save round trip can therefore never wipe a credential.
//
// "mailboxes" (outlook_token pool) is deliberately excluded: mergeOutlookPoolsLocked
// owns its clear/restore semantics and the pool editor needs the raw text.
const registerSecretMarkerSuffix = "_configured"

// registerSecretFieldNames are provider field names that hold a credential.
var registerSecretFieldNames = map[string]struct{}{
	"api_key":        {},
	"apikey":         {},
	"admin_password": {},
	"password":       {},
	"passwd":         {},
	"secret":         {},
	"api_secret":     {},
	"client_secret":  {},
	"access_token":   {},
	"refresh_token":  {},
	"auth_token":     {},
	"token":          {},
	"cookie":         {},
	"cookies":        {},
}

// registerSecretFieldSuffixes catch provider-specific names such as
// "cloudflare_api_key" or "imap_password".
var registerSecretFieldSuffixes = []string{"_api_key", "_secret", "_password", "_token", "_clearance", "_cookies"}

// isRegisterSecretField reports whether a mail provider field holds a credential.
func isRegisterSecretField(name string) bool {
	field := strings.ToLower(strings.TrimSpace(name))
	if field == "" || field == "mailboxes" || strings.HasSuffix(field, registerSecretMarkerSuffix) {
		return false
	}
	if _, ok := registerSecretFieldNames[field]; ok {
		return true
	}
	for _, suffix := range registerSecretFieldSuffixes {
		if strings.HasSuffix(field, suffix) {
			return true
		}
	}
	return false
}

// redactRegisterSnapshotSecrets blanks every credential in an API/SSE snapshot
// and records which fields had a stored value. Caller must hold the service lock.
func redactRegisterSnapshotSecrets(snapshot map[string]any) {
	if snapshot == nil {
		return
	}
	mail := util.StringMap(snapshot["mail"])
	providers := util.AsMapSlice(mail["providers"])
	redacted := make([]map[string]any, 0, len(providers))
	for _, provider := range providers {
		redacted = append(redacted, redactRegisterProviderSecrets(provider))
	}
	if len(providers) > 0 {
		mail["providers"] = redacted
		snapshot["mail"] = mail
	}
	if clearance := util.StringMap(snapshot["clearance"]); len(clearance) > 0 {
		snapshot["clearance"] = redactRegisterClearanceSecrets(clearance)
	}
}

func redactRegisterProviderSecrets(provider map[string]any) map[string]any {
	if provider == nil {
		return provider
	}
	fields := make([]string, 0, len(provider))
	for field := range provider {
		fields = append(fields, field)
	}
	sort.Strings(fields)
	for _, field := range fields {
		if !isRegisterSecretField(field) {
			continue
		}
		if util.Clean(provider[field]) != "" {
			// Keep the pointer only: the value itself must never leave the process.
			provider[field+registerSecretMarkerSuffix] = true
		} else {
			delete(provider, field+registerSecretMarkerSuffix)
		}
		provider[field] = ""
	}
	return provider
}

func redactRegisterClearanceSecrets(clearance map[string]any) map[string]any {
	for _, field := range []string{"cf_clearance", "cf_cookies"} {
		if util.Clean(clearance[field]) != "" {
			clearance[field+registerSecretMarkerSuffix] = true
		} else {
			delete(clearance, field+registerSecretMarkerSuffix)
		}
		clearance[field] = ""
	}
	return clearance
}

// preserveRegisterStoredSecrets carries stored credentials into an update payload
// whose secret fields are blank or missing. It returns a shallow copy; nested
// mail/clearance blocks are rebuilt so the caller's payload is left untouched.
func preserveRegisterStoredSecrets(stored, updates map[string]any) map[string]any {
	if len(stored) == 0 || len(updates) == 0 {
		return updates
	}
	out := make(map[string]any, len(updates))
	for key, value := range updates {
		out[key] = value
	}
	if incomingMail, ok := updates["mail"]; ok {
		if mail, ok := incomingMail.(map[string]any); ok {
			out["mail"] = preserveRegisterMailSecrets(util.StringMap(stored["mail"]), mail)
		}
	}
	if incomingClearance, ok := updates["clearance"]; ok {
		if clearance, ok := incomingClearance.(map[string]any); ok {
			out["clearance"] = preserveRegisterClearanceSecrets(util.StringMap(stored["clearance"]), clearance)
		}
	}
	return out
}

func preserveRegisterMailSecrets(storedMail, incomingMail map[string]any) map[string]any {
	out := make(map[string]any, len(incomingMail))
	for key, value := range incomingMail {
		out[key] = value
	}
	incomingProviders := util.AsMapSlice(incomingMail["providers"])
	storedProviders := util.AsMapSlice(storedMail["providers"])
	if len(incomingProviders) == 0 || len(storedProviders) == 0 {
		return out
	}
	claimed := make([]bool, len(storedProviders))
	rebuilt := make([]map[string]any, 0, len(incomingProviders))
	for index, provider := range incomingProviders {
		item := util.CopyMap(provider)
		if stored := matchStoredRegisterProvider(storedProviders, claimed, index, item); stored != nil {
			carryRegisterProviderSecrets(stored, item)
		}
		rebuilt = append(rebuilt, item)
	}
	out["providers"] = rebuilt
	return out
}

// matchStoredRegisterProvider pairs an incoming provider with its stored row:
// same index when the type matches, otherwise the first unclaimed same-type row.
func matchStoredRegisterProvider(stored []map[string]any, claimed []bool, index int, incoming map[string]any) map[string]any {
	incomingType := util.Clean(incoming["type"])
	if index < len(stored) && !claimed[index] && util.Clean(stored[index]["type"]) == incomingType {
		claimed[index] = true
		return stored[index]
	}
	for i, candidate := range stored {
		if claimed[i] || util.Clean(candidate["type"]) != incomingType {
			continue
		}
		claimed[i] = true
		return candidate
	}
	return nil
}

// carryRegisterProviderSecrets copies stored credentials into the incoming row
// when the request left them blank or omitted them, and drops presentation-only
// markers so they are never persisted.
func carryRegisterProviderSecrets(stored, incoming map[string]any) {
	for field, storedValue := range stored {
		if !isRegisterSecretField(field) {
			continue
		}
		value := util.Clean(storedValue)
		if value == "" || util.Clean(incoming[field]) != "" {
			continue
		}
		incoming[field] = value
	}
	for field := range incoming {
		if strings.HasSuffix(strings.ToLower(field), registerSecretMarkerSuffix) {
			delete(incoming, field)
		}
	}
}

func preserveRegisterClearanceSecrets(storedClearance, incomingClearance map[string]any) map[string]any {
	out := make(map[string]any, len(incomingClearance))
	for key, value := range incomingClearance {
		out[key] = value
	}
	for _, field := range []string{"cf_clearance", "cf_cookies"} {
		if util.Clean(out[field]) == "" {
			if storedValue := util.Clean(storedClearance[field]); storedValue != "" {
				out[field] = storedValue
			}
		}
		delete(out, field+registerSecretMarkerSuffix)
	}
	delete(out, "cf_credentials"+registerSecretMarkerSuffix)
	return out
}
