package service

// CreditCardPublic is the API-safe card view (never includes code_hash; key only when intentionally set).
type CreditCardPublic struct {
	ID        string `json:"id,omitempty"`
	Key       string `json:"key,omitempty"`
	Amount    int    `json:"amount"`
	Status    string `json:"status,omitempty"`
	UsedBy    string `json:"used_by,omitempty"`
	UsedAt    string `json:"used_at,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

// CreditCardPublicFromCard converts storage CreditCard to public API shape.
// includeKey controls whether a one-time/plaintext key is attached (generate/redeem flows).
func CreditCardPublicFromCard(card CreditCard, includeKey bool) CreditCardPublic {
	out := CreditCardPublic{
		ID:        card.ID,
		Amount:    card.Amount,
		Status:    card.Status,
		UsedBy:    card.UsedBy,
		UsedAt:    card.UsedAt,
		CreatedAt: card.CreatedAt,
	}
	if includeKey && card.Key != "" {
		out.Key = card.Key
	}
	return out
}

// CreditCardPublicListFromCards converts a card slice for admin list (keys usually empty).
func CreditCardPublicListFromCards(cards []CreditCard) []CreditCardPublic {
	out := make([]CreditCardPublic, 0, len(cards))
	for _, card := range cards {
		out = append(out, CreditCardPublicFromCard(card, false))
	}
	return out
}

// GeneratedCreditCardPublic is admin generate response item with one-time key.
type GeneratedCreditCardPublic struct {
	CreditCardPublic
}

// GeneratedCreditCardPublicList converts generate results for API.
func GeneratedCreditCardPublicList(items []GeneratedCreditCard) []GeneratedCreditCardPublic {
	out := make([]GeneratedCreditCardPublic, 0, len(items))
	for _, item := range items {
		card := item.Card
		card.Key = item.Key
		out = append(out, GeneratedCreditCardPublic{CreditCardPublic: CreditCardPublicFromCard(card, true)})
	}
	return out
}
