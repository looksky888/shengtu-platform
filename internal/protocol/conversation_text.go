package protocol

import (
	"regexp"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func IsTokenInvalidError(message string) bool {
	return service.IsAccountInvalidErrorMessage(message)
}

func MessageText(content any) string {
	switch v := content.(type) {
	case string:
		return v
	case []any:
		var parts []string
		for _, item := range v {
			switch x := item.(type) {
			case string:
				parts = append(parts, x)
			case map[string]any:
				t := util.Clean(x["type"])
				if t == "text" || t == "input_text" || t == "output_text" {
					parts = append(parts, util.Clean(x["text"]))
				}
			}
		}
		return strings.Join(parts, "")
	default:
		return ""
	}
}

func NormalizeMessages(messages any, system any) []map[string]any {
	var normalized []map[string]any
	if text := MessageText(system); text != "" {
		normalized = append(normalized, map[string]any{"role": "system", "content": text})
	}
	if list, ok := messages.([]map[string]any); ok {
		for _, message := range list {
			normalized = append(normalized, map[string]any{"role": firstNonEmpty(util.Clean(message["role"]), "user"), "content": MessageText(message["content"])})
		}
		return normalized
	}
	if list, ok := messages.([]any); ok {
		for _, raw := range list {
			if message, ok := raw.(map[string]any); ok {
				normalized = append(normalized, map[string]any{"role": firstNonEmpty(util.Clean(message["role"]), "user"), "content": MessageText(message["content"])})
			}
		}
	}
	return normalized
}

func AssistantHistoryText(messages []map[string]any) string {
	var parts []string
	for _, item := range messages {
		if item["role"] == "assistant" {
			parts = append(parts, util.Clean(item["content"]))
		}
	}
	return strings.Join(parts, "")
}

func AssistantHistoryMessages(messages []map[string]any) []string {
	var out []string
	for _, item := range messages {
		if item["role"] == "assistant" && util.Clean(item["content"]) != "" {
			out = append(out, util.Clean(item["content"]))
		}
	}
	return out
}
func AssistantText(event map[string]any, currentText, historyText string) string {
	for _, candidate := range []any{event, event["v"]} {
		m := util.StringMap(candidate)
		message := util.StringMap(m["message"])
		if len(message) == 0 {
			continue
		}
		author := util.StringMap(message["author"])
		if strings.ToLower(util.Clean(author["role"])) != "assistant" {
			continue
		}
		text := AssistantMessageText(message)
		if text != "" {
			return StripHistory(text, historyText)
		}
	}
	return ApplyTextPatch(event, currentText, historyText)
}

func EventAssistantText(event map[string]any, historyText string) string {
	for _, candidate := range []any{event, event["v"]} {
		m := util.StringMap(candidate)
		message := util.StringMap(m["message"])
		author := util.StringMap(message["author"])
		if author["role"] == "assistant" {
			return StripHistory(AssistantMessageText(message), historyText)
		}
	}
	return ""
}

func AssistantMessageText(message map[string]any) string {
	content := util.StringMap(message["content"])
	parts, _ := content["parts"].([]any)
	var out []string
	for _, part := range parts {
		if text, ok := part.(string); ok {
			out = append(out, text)
		}
	}
	return strings.Join(out, "")
}

func StripHistory(text, historyText string) string {
	for historyText != "" && strings.HasPrefix(text, historyText) {
		text = text[len(historyText):]
	}
	return text
}

func ApplyTextPatch(event map[string]any, currentText, historyText string) string {
	if event["p"] == "/message/content/parts/0" {
		return ApplyPatchOp(event, currentText, historyText)
	}
	if value, ok := event["v"].(string); ok && currentText != "" && event["p"] == nil && event["o"] == nil {
		return currentText + value
	}
	if event["o"] == "patch" {
		text := currentText
		for _, raw := range anyList(event["v"]) {
			if op, ok := raw.(map[string]any); ok {
				text = ApplyTextPatch(op, text, historyText)
			}
		}
		return text
	}
	text := currentText
	for _, raw := range anyList(event["v"]) {
		if op, ok := raw.(map[string]any); ok {
			text = ApplyTextPatch(op, text, historyText)
		}
	}
	return text
}

func ApplyPatchOp(operation map[string]any, currentText, historyText string) string {
	value := util.Clean(operation["v"])
	switch operation["o"] {
	case "append":
		return currentText + value
	case "replace":
		return StripHistory(value, historyText)
	default:
		return currentText
	}
}

func UpdateConversationState(state *ConversationState, payload string, event map[string]any) {
	conversationID, fileIDs, sedimentIDs := ExtractConversationIDs(payload)
	if conversationID != "" && state.ConversationID == "" {
		state.ConversationID = conversationID
	}
	if event != nil && IsImageToolEvent(event) {
		state.FileIDs = appendUnique(state.FileIDs, fileIDs...)
		state.SedimentIDs = appendUnique(state.SedimentIDs, sedimentIDs...)
	}
	if event == nil {
		return
	}
	if id := util.Clean(event["conversation_id"]); id != "" {
		state.ConversationID = id
	}
	value := util.StringMap(event["v"])
	if id := util.Clean(value["conversation_id"]); id != "" {
		state.ConversationID = id
	}
	if event["type"] == "moderation" {
		moderation := util.StringMap(event["moderation_response"])
		if moderation["blocked"] == true {
			state.Blocked = true
		}
	}
	if event["type"] == "server_ste_metadata" {
		metadata := util.StringMap(event["metadata"])
		if toolInvoked, ok := metadata["tool_invoked"].(bool); ok {
			state.ToolInvoked = &toolInvoked
		}
		if value := util.Clean(metadata["turn_use_case"]); value != "" {
			state.TurnUseCase = value
		}
	}
}

func ExtractConversationIDs(payload string) (string, []string, []string) {
	conversation := ""
	if match := regexp.MustCompile(`"conversation_id"\s*:\s*"([^"]+)"`).FindStringSubmatch(payload); len(match) > 1 {
		conversation = match[1]
	}
	fileIDs := regexp.MustCompile(`\bfile_00000000[a-f0-9]{24}\b`).FindAllString(payload, -1)
	for _, match := range regexp.MustCompile(`file-service://([A-Za-z0-9_-]+)`).FindAllStringSubmatch(payload, -1) {
		if len(match) > 1 {
			fileIDs = appendUnique(fileIDs, match[1])
		}
	}
	sedimentMatches := regexp.MustCompile(`sediment://([A-Za-z0-9_-]+)`).FindAllStringSubmatch(payload, -1)
	var sediments []string
	for _, match := range sedimentMatches {
		if len(match) > 1 {
			sediments = append(sediments, match[1])
		}
	}
	return conversation, fileIDs, sediments
}

func IsImageToolEvent(event map[string]any) bool {
	value := util.StringMap(event["v"])
	message := util.StringMap(event["message"])
	if len(message) == 0 {
		message = util.StringMap(value["message"])
	}
	metadata := util.StringMap(message["metadata"])
	author := util.StringMap(message["author"])
	role := strings.ToLower(util.Clean(author["role"]))
	if role != "tool" && role != "assistant" {
		return false
	}
	// Asset pointers also occur on ordinary assistant attachments. The
	// async_task_type marker is the reliable boundary for generated images.
	return util.Clean(metadata["async_task_type"]) == "image_gen"
}

func conversationBaseEvent(eventType string, state *ConversationState) ConversationEvent {
	var tool any
	if state.ToolInvoked != nil {
		tool = *state.ToolInvoked
	}
	return ConversationEvent{
		"type":            eventType,
		"text":            state.Text,
		"conversation_id": state.ConversationID,
		"file_ids":        state.FileIDs,
		"sediment_ids":    state.SedimentIDs,
		"blocked":         state.Blocked,
		"tool_invoked":    tool,
		"turn_use_case":   state.TurnUseCase,
	}
}

func anyList(v any) []any {
	switch list := v.(type) {
	case []any:
		return list
	case []map[string]any:
		out := make([]any, 0, len(list))
		for _, item := range list {
			out = append(out, item)
		}
		return out
	}
	return nil
}

func appendUnique(base []string, values ...string) []string {
	seen := map[string]struct{}{}
	for _, item := range base {
		seen[item] = struct{}{}
	}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		base = append(base, value)
	}
	return base
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
