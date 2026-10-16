package storage

import "strings"

// boundPlaceholders creates only SQL placeholder tokens; values are always
// supplied separately as driver arguments. A zero count returns an empty
// string so callers can short-circuit before building IN clauses.
func (b *DatabaseBackend) boundPlaceholders(start, count int) string {
	if count <= 0 {
		return ""
	}
	values := make([]string, count)
	for i := range values {
		values[i] = b.placeholder(start + i)
	}
	return strings.Join(values, ",")
}
