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

// likeEscapeClause is the single shared LIKE escape declaration for every
// dialect (SQLite, MySQL and Postgres all accept a one-character ESCAPE).
// Keyword searches must append it, otherwise user input is read as wildcards.
const likeEscapeClause = ` ESCAPE '!'`

// escapeLikePattern neutralises the LIKE metacharacters in user input so a
// literal '%' or '_' matches itself instead of the whole table.
func escapeLikePattern(value string) string {
	return strings.NewReplacer(`!`, `!!`, `%`, `!%`, `_`, `!_`).Replace(value)
}

// likeContainsPattern renders a "contains" LIKE pattern for one search term.
func likeContainsPattern(value string) string {
	return "%" + escapeLikePattern(value) + "%"
}
