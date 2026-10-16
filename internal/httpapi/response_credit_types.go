package httpapi

import "chatgpt2api/internal/service"

type profileCreditResponse struct {
	Account        service.CreditAccount `json:"account"`
	Balance        int                   `json:"balance"`
	CheckedInToday bool                  `json:"checked_in_today"`
}

type creditRedeemResponse struct {
	Account service.CreditAccount     `json:"account"`
	Balance int                       `json:"balance"`
	Entry   service.CreditLedgerEntry `json:"entry"`
	Card    service.CreditCardPublic  `json:"card"`
}

type creditCheckinResponse struct {
	Account service.CreditAccount     `json:"account"`
	Balance int                       `json:"balance"`
	Entry   service.CreditLedgerEntry `json:"entry"`
	Awarded bool                      `json:"awarded"`
}

type inviteResponse struct {
	Code string `json:"code"`
	Link string `json:"link"`
}

type creditCardsPageResponse struct {
	Items       []service.CreditCardPublic `json:"items"`
	Total       int                        `json:"total"`
	Page        int                        `json:"page"`
	PageSize    int                        `json:"page_size"`
	ActiveCount int                        `json:"active_count"`
	UsedCount   int                        `json:"used_count"`
}

type creditAccountEntryResponse struct {
	Account service.CreditAccount     `json:"account"`
	Entry   service.CreditLedgerEntry `json:"entry"`
}
