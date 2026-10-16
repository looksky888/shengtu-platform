package httpapi

import "chatgpt2api/internal/service"

type accountPoolHealthResponse struct {
	Pool            service.AccountPoolHealthPublic `json:"pool"`
	Quarantine      []service.QuarantineItemPublic  `json:"quarantine"`
	QuarantineMeta  service.QuarantineListPublic    `json:"quarantine_meta"`
	TemporaryCount  int                             `json:"temporary_count"`
	PermanentCount  int                             `json:"permanent_count"`
	QuarantineTotal int                             `json:"quarantine_total"`
}
