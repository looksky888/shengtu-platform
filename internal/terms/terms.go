// Package terms holds the canonical user-agreement version for login/register.
// Frontend must submit the same version (see /auth/providers → terms.version).
package terms

// Version is the single source of truth for accept_terms.terms_version checks.
// Bump when legal copy changes; keep web login dialog content aligned.
const Version = "2026-07-13"

// Title is the user-facing agreement name (Chinese UI).
const Title = "用户协议与免责声明"
