package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"sort"
)

// MaxGenerateCardsPerRequest caps admin card minting in a single API call.
const MaxGenerateCardsPerRequest = 100

// MaxGenerateCardAmount is the max face value for one generated credit card.
const MaxGenerateCardAmount = 1_000_000

func (s *CreditService) GenerateCards(count, amount int) ([]GeneratedCreditCard, error) {
	if count <= 0 {
		return nil, fmt.Errorf("数量必须为正数")
	}
	if count > MaxGenerateCardsPerRequest {
		return nil, fmt.Errorf("单次最多生成 %d 张卡密", MaxGenerateCardsPerRequest)
	}
	if amount <= 0 {
		return nil, fmt.Errorf("金额必须为正数")
	}
	if amount > MaxGenerateCardAmount {
		return nil, fmt.Errorf("单张卡密面值不能超过 %d", MaxGenerateCardAmount)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	nextState := cloneCreditState(s.state)
	now := util.NowISO()
	items := make([]GeneratedCreditCard, 0, count)
	for len(items) < count {
		key := "ck-" + util.RandomTokenURL(18)
		hash := util.SHA256Hex(key)
		if creditCardByHash(nextState.Cards, hash) != nil {
			continue
		}
		// Never persist plaintext card codes — only hash at rest; plaintext returned once in GeneratedCreditCard.Key.
		card := CreditCard{ID: "card_" + util.NewHex(12), Key: "", CodeHash: hash, Amount: amount, Status: CreditCardStatusActive, CreatedAt: now}
		nextState.Cards[card.ID] = card
		items = append(items, GeneratedCreditCard{Card: card, Key: key})
	}
	if err := s.saveLocked(nextState); err != nil {
		return nil, err
	}
	s.state = nextState
	return items, nil
}

func (s *CreditService) Cards() []CreditCard {
	s.mu.Lock()
	defer s.mu.Unlock()

	items := make([]CreditCard, 0, len(s.state.Cards))
	for _, card := range s.state.Cards {
		items = append(items, card)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt > items[j].CreatedAt })
	return items
}

func (s *CreditService) DisableCard(cardID string) (CreditCard, error) {
	cardID = util.Clean(cardID)
	if cardID == "" {
		return CreditCard{}, fmt.Errorf("请提供 card_id")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	card, ok := s.state.Cards[cardID]
	if !ok {
		return CreditCard{}, ErrCreditCardNotFound
	}
	if card.Status == CreditCardStatusUsed {
		return CreditCard{}, ErrCreditCardInactive
	}
	if card.Status == CreditCardStatusDisabled {
		return card, nil
	}
	nextState := cloneCreditState(s.state)
	card.Status = CreditCardStatusDisabled
	nextState.Cards[card.ID] = card
	if err := s.saveLocked(nextState); err != nil {
		return CreditCard{}, err
	}
	s.state = nextState
	return card, nil
}

func (s *CreditService) RedeemCard(userID, key string) (CreditAccount, CreditLedgerEntry, CreditCard, error) {
	userID = util.Clean(userID)
	key = util.Clean(key)
	if userID == "" {
		return CreditAccount{}, CreditLedgerEntry{}, CreditCard{}, fmt.Errorf("请提供 user_id")
	}
	if key == "" {
		return CreditAccount{}, CreditLedgerEntry{}, CreditCard{}, fmt.Errorf("请提供兑换码")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	card := creditCardByHash(s.state.Cards, util.SHA256Hex(key))
	if card == nil {
		return CreditAccount{}, CreditLedgerEntry{}, CreditCard{}, ErrCreditCardNotFound
	}
	if card.Status != CreditCardStatusActive {
		return CreditAccount{}, CreditLedgerEntry{}, *card, ErrCreditCardInactive
	}
	// In-place under lock; roll back card/account/ledger on save failure.
	prevCard := s.state.Cards[card.ID]
	prevAccount, hadAccount := s.state.Accounts[userID]
	ledgerLen := len(s.state.Ledger)

	now := util.NowISO()
	nextCard := prevCard
	nextCard.Status = CreditCardStatusUsed
	nextCard.Key = "" // never store redeemed plaintext
	nextCard.UsedBy = userID
	nextCard.UsedAt = now
	s.state.Cards[nextCard.ID] = nextCard

	account := ensureCreditAccount(s.state, userID, now)
	account.Balance += nextCard.Amount
	account.UpdatedAt = now
	entry := CreditLedgerEntry{ID: util.NewUUID(), UserID: userID, Delta: nextCard.Amount, BalanceAfter: account.Balance, Reason: CreditReasonCardRedeem, RefID: nextCard.ID, CreatedAt: now}
	if s.state.Accounts == nil {
		s.state.Accounts = map[string]CreditAccount{}
	}
	s.state.Accounts[userID] = account
	s.state.Ledger = append(s.state.Ledger, entry)
	if err := s.saveLocked(s.state); err != nil {
		s.state.Ledger = s.state.Ledger[:ledgerLen]
		s.state.Cards[prevCard.ID] = prevCard
		if hadAccount {
			s.state.Accounts[userID] = prevAccount
		} else {
			delete(s.state.Accounts, userID)
		}
		return CreditAccount{}, CreditLedgerEntry{}, CreditCard{}, err
	}
	if entry.RefID != "" {
		if s.ledgerRefIndex == nil {
			s.ledgerRefIndex = map[string]int{}
		}
		s.ledgerRefIndex[ledgerRefKey(userID, entry.Reason, entry.RefID)] = len(s.state.Ledger) - 1
	}
	s.trimInMemoryLedgerLocked()
	return account, entry, nextCard, nil
}

func creditCardByHash(cards map[string]CreditCard, hash string) *CreditCard {
	for _, card := range cards {
		if card.CodeHash == hash {
			next := card
			return &next
		}
	}
	return nil
}
