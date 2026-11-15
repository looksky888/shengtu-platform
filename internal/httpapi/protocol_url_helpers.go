package httpapi

import (
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
)

func collectURLs(v any) []string {
	return collectURLsInternal(v, nil, true)
}

func collectStructuredURLs(v any) []string {
	return collectURLsInternal(v, nil, false)
}

func collectCountableURLs(v any, tracker *protocol.GeneratedImageTracker) []string {
	return collectURLsInternal(v, tracker, false)
}

func collectURLsInternal(v any, tracker *protocol.GeneratedImageTracker, allowUntrackedMarkdown bool) []string {
	switch x := v.(type) {
	case map[string]any:
		var urls []string
		for key, value := range x {
			if key == "url" {
				if u := util.Clean(value); u != "" {
					urls = append(urls, u)
				}
			} else if key == "urls" {
				for _, raw := range anyList(value) {
					if u := util.Clean(raw); u != "" {
						urls = append(urls, u)
					}
				}
			} else if key == "content" || key == "text" {
				if text, ok := value.(string); ok {
					for _, target := range extractMarkdownImageTargets(text) {
						if !isHTTPOrMediaURL(target) {
							continue
						}
						if allowUntrackedMarkdown || (tracker != nil && tracker.HasURL(target)) {
							urls = append(urls, target)
						}
					}
				} else {
					urls = append(urls, collectURLsInternal(value, tracker, allowUntrackedMarkdown)...)
				}
			} else if key == "result" && util.Clean(x["type"]) == "image_generation_call" {
				if target := util.Clean(value); isHTTPOrMediaURL(target) {
					urls = append(urls, target)
				}
			} else {
				urls = append(urls, collectURLsInternal(value, tracker, allowUntrackedMarkdown)...)
			}
		}
		return urls
	case []any:
		var urls []string
		for _, item := range x {
			urls = append(urls, collectURLsInternal(item, tracker, allowUntrackedMarkdown)...)
		}
		return urls
	case []map[string]any:
		var urls []string
		for _, item := range x {
			urls = append(urls, collectURLsInternal(item, tracker, allowUntrackedMarkdown)...)
		}
		return urls
	default:
		return nil
	}
}

func dedupe(items []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, item := range items {
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}
