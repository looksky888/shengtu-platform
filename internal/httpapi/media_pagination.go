package httpapi

func normalizedMediaPageLimit(limit int) int {
	if limit < 1 || limit > 100 {
		return 50
	}
	return limit
}
