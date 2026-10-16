package backend

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func (c *Client) getConversation(ctx context.Context, conversationID string) (map[string]any, error) {
	path := "/backend-api/conversation/" + url.PathEscape(conversationID)
	resp, err := c.doUpstreamRequest(ctx, c.httpClient, http.MethodGet, c.BaseURL+path, path, nil, c.headersContext(ctx, path, map[string]string{"Accept": "application/json"}))
	if err != nil {
		return nil, upstreamTransportError(path, err)
	}
	return readJSONResponse(resp, path)
}

// FindRecentConversationByPrompt recovers a conversation id when an image SSE
// stream ends before emitting its metadata. Images 2.5 may continue running
// asynchronously, so the conversation list is a bounded, read-only recovery
// probe rather than a second generation attempt.
func (c *Client) FindRecentConversationByPrompt(ctx context.Context, prompt string, startedAt time.Time) (string, error) {
	if c.AccessToken == "" {
		return "", fmt.Errorf("access_token is required for conversation recovery")
	}
	path := "/backend-api/conversations?offset=0&limit=10&order=updated&conversation_filter=all"
	resp, err := c.doUpstreamRequest(ctx, c.httpClient, http.MethodGet, c.BaseURL+path, path, nil, c.headersContext(ctx, "/backend-api/conversations", map[string]string{"Accept": "application/json"}))
	if err != nil {
		return "", upstreamTransportError(path, err)
	}
	payload, err := readJSONResponse(resp, path)
	if err != nil {
		return "", err
	}
	items := anySlice(payload["items"])
	if len(items) == 0 {
		items = anySlice(payload["conversations"])
	}
	prompt = strings.ToLower(strings.TrimSpace(prompt))
	if prompt == "" || len(items) == 0 {
		return "", nil
	}
	started := startedAt.Unix()
	bestID := ""
	bestScore := 0.0
	secondBestScore := 0.0
	for _, raw := range items {
		item := util.StringMap(raw)
		id := firstNonEmpty(util.Clean(item["id"]), util.Clean(item["conversation_id"]))
		if id == "" {
			continue
		}
		if updated := conversationUnixTime(item); updated > 0 && (updated < started-30 || updated > started+600) {
			continue
		}
		title := strings.ToLower(strings.TrimSpace(util.Clean(item["title"])))
		if title == "" {
			continue
		}
		score := conversationPromptMatchScore(prompt, title)
		if score > bestScore {
			secondBestScore = bestScore
			bestID, bestScore = id, score
		} else if score > secondBestScore {
			secondBestScore = score
		}
	}
	if bestScore < 0.35 || secondBestScore > 0 && bestScore-secondBestScore < 0.08 {
		return "", nil
	}
	return bestID, nil
}

func conversationPromptMatchScore(prompt, title string) float64 {
	prompt = strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(prompt))), " ")
	title = strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(title))), " ")
	if prompt == "" || title == "" {
		return 0
	}
	if prompt == title {
		return 1
	}
	if utf8RuneCount(title) >= 4 && (strings.Contains(prompt, title) || strings.Contains(title, prompt)) {
		return 0.95
	}
	promptWords := strings.Fields(prompt)
	titleWords := strings.Fields(title)
	if len(promptWords) > 1 && len(titleWords) > 0 {
		matched := 0
		for _, word := range promptWords {
			if utf8RuneCount(word) >= 2 && strings.Contains(title, word) {
				matched++
			}
		}
		if score := float64(matched) / float64(len(promptWords)); score > 0 {
			return score
		}
	}
	return runeBigramDice(prompt, title)
}

func utf8RuneCount(value string) int {
	return len([]rune(value))
}

func runeBigramDice(left, right string) float64 {
	leftRunes, rightRunes := []rune(left), []rune(right)
	if len(leftRunes) < 2 || len(rightRunes) < 2 {
		return 0
	}
	leftPairs := make(map[string]int, len(leftRunes)-1)
	for i := 0; i+1 < len(leftRunes); i++ {
		leftPairs[string(leftRunes[i:i+2])]++
	}
	intersection := 0
	for i := 0; i+1 < len(rightRunes); i++ {
		pair := string(rightRunes[i : i+2])
		if leftPairs[pair] > 0 {
			intersection++
			leftPairs[pair]--
		}
	}
	return 2 * float64(intersection) / float64(len(leftRunes)+len(rightRunes)-2)
}

func conversationUnixTime(item map[string]any) int64 {
	for _, key := range []string{"update_time", "updated_at", "create_time", "created_at"} {
		raw := item[key]
		switch value := raw.(type) {
		case float64:
			return int64(value)
		case int64:
			return value
		case int:
			return int64(value)
		case string:
			if n, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64); err == nil {
				return n
			}
			if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value)); err == nil {
				return parsed.Unix()
			}
		}
	}
	return 0
}

func (c *Client) pollImageResults(ctx context.Context, conversationID string, timeout time.Duration) ([]string, []string) {
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	deadline := time.Now().Add(timeout)
	initialWait := imagePollInitialWait()
	if initialWait > 0 {
		if !sleepWithinContext(ctx, minDuration(initialWait+time.Duration(rand.Int63n(int64(minDuration(2*time.Second, initialWait/5+time.Millisecond)))), time.Until(deadline))) {
			return nil, nil
		}
	}
	interval := imagePollInterval()
	if interval <= 0 {
		interval = 10 * time.Second
	}
	attempt := 0
	for time.Now().Before(deadline) {
		attempt++
		// Images 2.5 may publish the asset in /backend-api/tasks before the
		// conversation document contains the final mapping node. The reference
		// implementation consumes image_gen_message from this endpoint; dropping
		// the response here leaves the poller with no file id and eventually
		// turns a successful upstream task into a timeout.
		if tasks := c.queryImageTasks(ctx, conversationID, 5*time.Second); len(tasks) > 0 {
			files, sediments := extractImageTaskRecords(tasks)
			if len(files) > 0 || len(sediments) > 0 {
				return files, sediments
			}
		}
		conversation, err := c.getConversation(ctx, conversationID)
		if err == nil {
			files, sediments := extractImageToolRecords(conversation)
			if len(files) > 0 || len(sediments) > 0 {
				return files, sediments
			}
		} else if isTransientPollError(err) {
			backoff := minDuration(time.Duration(1<<min(attempt, 4))*time.Second+time.Duration(rand.Int63n(int64(500*time.Millisecond))), time.Until(deadline))
			if !sleepWithinContext(ctx, backoff) {
				return nil, nil
			}
			continue
		}
		if !sleepWithinContext(ctx, minDuration(interval, time.Until(deadline))) {
			return nil, nil
		}
	}
	return nil, nil
}

// extractImageTaskRecords extracts image assets exposed by /backend-api/tasks.
// ChatGPT has returned these records under image_gen_message while the
// conversation mapping was still empty, so this probe must be treated as a
// first-class result source during asynchronous recovery.
func extractImageTaskRecords(tasks []map[string]any) ([]string, []string) {
	var files, sediments []string
	for _, task := range tasks {
		message := util.StringMap(task["image_gen_message"])
		if len(message) == 0 {
			continue
		}
		candidateFiles, candidateSediments := extractImageReferenceIDs(message)
		files = appendUnique(files, candidateFiles...)
		sediments = appendUnique(sediments, candidateSediments...)
	}
	return files, sediments
}

func (c *Client) queryImageTasks(ctx context.Context, conversationID string, timeout time.Duration) []map[string]any {
	if strings.TrimSpace(conversationID) == "" {
		return nil
	}
	queryCtx := ctx
	cancel := func() {}
	if timeout > 0 {
		queryCtx, cancel = context.WithTimeout(ctx, timeout)
	}
	defer cancel()
	path := "/backend-api/tasks"
	resp, err := c.doUpstreamRequest(queryCtx, c.httpClient, http.MethodGet, c.BaseURL+path, path, nil, c.headersContext(queryCtx, path, map[string]string{"Accept": "application/json"}))
	if err != nil {
		return nil
	}
	payload, err := readJSONResponse(resp, path)
	if err != nil {
		return nil
	}
	var out []map[string]any
	for _, raw := range anySlice(payload["tasks"]) {
		task := util.StringMap(raw)
		if len(task) == 0 {
			continue
		}
		if util.Clean(task["conversation_id"]) == conversationID || util.Clean(task["original_conversation_id"]) == conversationID {
			out = append(out, task)
		}
	}
	return out
}
