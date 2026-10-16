package service

import (
	"fmt"
	"math/rand"
	"strings"
)

func registerRandomMailboxName() string {
	return fmt.Sprintf("%s%d%s", randomLower(5), rand.Intn(999), randomLower(2+rand.Intn(2)))
}

func registerRandomSubdomainLabel() string {
	return randomAlphaNum(4 + rand.Intn(7))
}

func nextRegisterDomain(domains []string) (string, error) {
	filtered := make([]string, 0, len(domains))
	for _, domain := range domains {
		if item := strings.TrimSpace(domain); item != "" {
			filtered = append(filtered, item)
		}
	}
	if len(filtered) == 0 {
		return "", fmt.Errorf("mail domain is required")
	}
	if len(filtered) == 1 {
		return filtered[0], nil
	}
	registerMailDomainMu.Lock()
	value := filtered[registerMailDomainSeq%len(filtered)]
	registerMailDomainSeq = (registerMailDomainSeq + 1) % len(filtered)
	registerMailDomainMu.Unlock()
	return value, nil
}

func randomLower(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz"
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteByte(letters[rand.Intn(len(letters))])
	}
	return b.String()
}

func randomAlphaNum(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteByte(chars[rand.Intn(len(chars))])
	}
	return b.String()
}
