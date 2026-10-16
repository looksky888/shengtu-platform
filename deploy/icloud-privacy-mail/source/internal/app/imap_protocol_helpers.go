package app

import (
	"strconv"
	"strings"
)

func imapLiteralSize(line string) (int, bool) {
	line = strings.TrimSpace(line)
	if !strings.HasSuffix(line, "}") {
		return 0, false
	}
	start := strings.LastIndex(line, "{")
	if start < 0 || start+1 >= len(line) {
		return 0, false
	}
	value := strings.TrimSuffix(line[start+1:], "}")
	value = strings.TrimSuffix(value, "+")
	n, err := strconv.Atoi(value)
	return n, err == nil && n >= 0
}

func imapSearchUIDs(lines []string) []int {
	var out []int
	for _, line := range lines {
		if !strings.HasPrefix(strings.ToUpper(strings.TrimSpace(line)), "* SEARCH") {
			continue
		}
		for _, part := range strings.Fields(strings.TrimSpace(strings.TrimPrefix(line, "* SEARCH"))) {
			n, err := strconv.Atoi(part)
			if err == nil && n > 0 {
				out = append(out, n)
			}
		}
	}
	return out
}

func imapFetchUIDs(lines []string) []int {
	var out []int
	for _, line := range lines {
		fields := strings.Fields(line)
		for i := 0; i+1 < len(fields); i++ {
			if strings.EqualFold(strings.Trim(fields[i], "()"), "UID") {
				value := strings.Trim(fields[i+1], "()")
				if n, err := strconv.Atoi(value); err == nil && n > 0 {
					out = append(out, n)
				}
			}
		}
	}
	return out
}

func sortInts(values []int) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

func lastIntValues(values []int, limit int) []int {
	if limit <= 0 || len(values) <= limit {
		return values
	}
	return values[len(values)-limit:]
}

func chunkInts(values []int, size int) [][]int {
	if size <= 0 {
		size = len(values)
	}
	var out [][]int
	for start := 0; start < len(values); start += size {
		end := start + size
		if end > len(values) {
			end = len(values)
		}
		out = append(out, values[start:end])
	}
	return out
}

func imapUIDSet(values []int) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, strconv.Itoa(value))
	}
	return strings.Join(parts, ",")
}
