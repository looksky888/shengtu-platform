package service

import (
	"sort"

	"chatgpt2api/internal/util"
)

func cloneMenuPermissions(items []MenuPermission) []MenuPermission {
	out := make([]MenuPermission, 0, len(items))
	for _, item := range items {
		next := item
		next.Children = cloneMenuPermissions(item.Children)
		out = append(out, next)
	}
	return out
}

func filterMenuPermissions(items []MenuPermission, allowed map[string]struct{}) []MenuPermission {
	out := make([]MenuPermission, 0, len(items))
	for _, item := range items {
		children := filterMenuPermissions(item.Children, allowed)
		_, ok := allowed[item.Path]
		if !ok && len(children) == 0 {
			continue
		}
		next := item
		next.Children = children
		out = append(out, next)
	}
	return out
}

func walkMenuPermissions(items []MenuPermission, visit func(MenuPermission)) {
	for _, item := range items {
		visit(item)
		walkMenuPermissions(item.Children, visit)
	}
}

func sliceSet(values []string) map[string]struct{} {
	out := make(map[string]struct{}, len(values))
	for _, value := range values {
		out[value] = struct{}{}
	}
	return out
}

func normalizeKnownStrings(values []string, known map[string]struct{}) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		item := normalizePermissionPath(util.Clean(value))
		if _, ok := known[item]; !ok {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	sort.Strings(out)
	return out
}
