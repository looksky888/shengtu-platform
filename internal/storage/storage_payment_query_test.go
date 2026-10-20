package storage

import "testing"

func TestLikeContainsPatternEscapesMetaCharacters(t *testing.T) {
	for _, tc := range []struct {
		name  string
		value string
		want  string
	}{
		{name: "plain text", value: "trade", want: "%trade%"},
		{name: "underscore is a literal", value: "a_b", want: "%a!_b%"},
		{name: "percent is a literal", value: "100%", want: "%100!%%"},
		{name: "escape char is doubled", value: "a!b", want: "%a!!b%"},
		{name: "every meta character", value: "!%_", want: "%!!!%!_%"},
		{name: "empty stays a contains pattern", value: "", want: "%%"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := likeContainsPattern(tc.value); got != tc.want {
				t.Fatalf("likeContainsPattern(%q) = %q, want %q", tc.value, got, tc.want)
			}
		})
	}
}

// TestPaymentOrderKeywordSearchTreatsWildcardsLiterally pins the audit finding
// that "a_b" used to match "aXb" and a bare "%" used to match every order.
func TestPaymentOrderKeywordSearchTreatsWildcardsLiterally(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	for index, seed := range []struct {
		id       string
		outTrade string
		product  string
	}{
		{id: "order-underscore", outTrade: "trade-a_b", product: "普通套餐"},
		{id: "order-decoy", outTrade: "trade-aXb", product: "普通套餐"},
		{id: "order-percent", outTrade: "trade-percent", product: "限时100%折扣"},
		{id: "order-plain", outTrade: "trade-plain", product: "限时100折"},
		{id: "order-bang", outTrade: "trade-bang", product: "特价!"},
	} {
		order := paymentRepositoryTestOrder(seed.id, seed.outTrade, "idem-"+seed.id)
		order.ProductNameSnapshot = seed.product
		order.CreatedAt = []string{
			"2026-08-30T01:00:00Z", "2026-08-30T02:00:00Z", "2026-08-30T03:00:00Z",
			"2026-08-30T04:00:00Z", "2026-08-30T05:00:00Z",
		}[index]
		order.UpdatedAt = order.CreatedAt
		if _, _, err := backend.CreatePaymentOrder(order); err != nil {
			t.Fatalf("seed %s: %v", seed.id, err)
		}
	}
	for _, tc := range []struct {
		name    string
		keyword string
		want    []string
	}{
		{name: "underscore stays literal", keyword: "a_b", want: []string{"order-underscore"}},
		{name: "underscore is case folded", keyword: "A_B", want: []string{"order-underscore"}},
		{name: "lone underscore stays literal", keyword: "_", want: []string{"order-underscore"}},
		{name: "percent does not match the whole table", keyword: "%", want: []string{"order-percent"}},
		{name: "percent inside a term", keyword: "100%", want: []string{"order-percent"}},
		{name: "escape character stays literal", keyword: "!", want: []string{"order-bang"}},
		{name: "plain keyword still matches", keyword: "特价", want: []string{"order-bang"}},
		{name: "plain wildcard free term", keyword: "trade-aXb", want: []string{"order-decoy"}},
		{name: "unmatched term", keyword: "a!b", want: nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			items, total, err := backend.QueryPaymentOrders(PaymentOrderFilter{Keyword: tc.keyword})
			if err != nil {
				t.Fatalf("QueryPaymentOrders(%q) error = %v", tc.keyword, err)
			}
			ids := make([]string, 0, len(items))
			for _, item := range items {
				ids = append(ids, item.ID)
			}
			if len(ids) != len(tc.want) {
				t.Fatalf("QueryPaymentOrders(%q) ids = %v, want %v", tc.keyword, ids, tc.want)
			}
			for index, want := range tc.want {
				if ids[index] != want {
					t.Fatalf("QueryPaymentOrders(%q) ids = %v, want %v", tc.keyword, ids, tc.want)
				}
			}
			if total != len(tc.want) {
				t.Fatalf("QueryPaymentOrders(%q) total = %d, want %d", tc.keyword, total, len(tc.want))
			}
		})
	}
}
