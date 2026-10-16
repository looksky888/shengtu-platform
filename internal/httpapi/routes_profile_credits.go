package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleProfileCredits(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	userID, ok := profileCreditUserID(w, identity)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	account, err := a.credits.Account(userID)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	today := util.ChinaDate()
	util.WriteJSON(w, http.StatusOK, profileCreditResponse{
		Account:        account,
		Balance:        account.Balance,
		CheckedInToday: a.credits.HasLedgerEntry(userID, service.CreditReasonCheckin, today),
	})
}

func (a *App) handleProfileCreditLedger(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	userID, ok := profileCreditUserID(w, identity)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	page := util.ToInt(q.Get("page"), 0)
	pageSize := util.ToInt(q.Get("page_size"), 0)
	// Default profile page size when omitted (keeps payload small for heavy users).
	if pageSize == 0 {
		pageSize = 10
	}
	result, err := a.credits.QueryLedger(service.CreditLedgerQuery{
		Page:     page,
		PageSize: pageSize,
		UserID:   userID,
	})
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, result)
}

func (a *App) handleProfileCreditRedeem(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	userID, ok := profileCreditUserID(w, identity)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	account, entry, card, err := a.credits.RedeemCard(userID, util.Clean(body["key"]))
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, service.ErrCreditCardNotFound) {
			status = http.StatusNotFound
		}
		if errors.Is(err, service.ErrCreditCardInactive) {
			status = http.StatusConflict
		}
		util.WriteError(w, status, creditBillingMessage(err))
		return
	}
	util.WriteJSON(w, http.StatusOK, creditRedeemResponse{
		Account: account,
		Balance: account.Balance,
		Entry:   entry,
		Card:    publicCreditCard(card),
	})
}

func (a *App) handleProfileCheckin(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	userID, ok := profileCreditUserID(w, identity)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	account, entry, awarded, err := a.credits.CheckIn(userID, util.NowChina())
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, creditCheckinResponse{
		Account: account,
		Balance: account.Balance,
		Entry:   entry,
		Awarded: awarded,
	})
}

func (a *App) handleProfileInvite(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	userID, ok := profileCreditUserID(w, identity)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	code, err := a.credits.InviteCode(userID)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, inviteResponse{
		Code: code,
		Link: "/login?register=1&invite_code=" + code,
	})
}

func profileCreditUserID(w http.ResponseWriter, identity service.Identity) (string, bool) {
	if identity.OwnerID != "" {
		return identity.OwnerID, true
	}
	if identity.Kind == service.AuthKindSession && identity.ID != "" {
		return identity.ID, true
	}
	util.WriteError(w, http.StatusForbidden, "积分功能需要绑定用户账号")
	return "", false
}

func (a *App) handleAdminCredits(w http.ResponseWriter, r *http.Request) {
	// RBAC: GET/POST /api/admin/credits (subtree). Admin bypasses; custom roles need grant.
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	base := "/api/admin/credits"
	path := r.URL.Path
	switch {
	case path == base+"/cards":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		result, err := a.credits.QueryCards(service.CreditCardsQuery{
			Page:     util.ToInt(q.Get("page"), 0),
			PageSize: util.ToInt(q.Get("page_size"), 0),
			Keyword:  strings.TrimSpace(q.Get("keyword")),
			Status:   strings.TrimSpace(q.Get("status")),
			StartAt:  strings.TrimSpace(q.Get("start_at")),
			EndAt:    strings.TrimSpace(q.Get("end_at")),
		})
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, creditCardsPageResponse{
			Items:       service.CreditCardPublicListFromCards(result.Items),
			Total:       result.Total,
			Page:        result.Page,
			PageSize:    result.PageSize,
			ActiveCount: result.ActiveCount,
			UsedCount:   result.UsedCount,
		})
	case path == base+"/cards/generate":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body service.CreditCardsGenerateInput
		if !readJSONOr400(w, r, &body) {
			return
		}
		count := body.Count
		if count <= 0 {
			count = 1
		}
		items, err := a.credits.GenerateCards(count, body.Amount)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, itemsResponse[service.GeneratedCreditCardPublic]{Items: service.GeneratedCreditCardPublicList(items)})
	case strings.HasPrefix(path, base+"/users/") && strings.HasSuffix(path, "/adjust"):
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		parts := splitPath(path)
		if len(parts) != 6 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "credits" || parts[3] != "users" || parts[5] != "adjust" {
			http.NotFound(w, r)
			return
		}
		var body service.CreditAdjustInput
		if !readJSONOr400(w, r, &body) {
			return
		}
		refID := firstNonEmpty(util.Clean(body.RefID), identity.ID)
		account, entry, err := a.credits.Adjust(parts[4], body.Delta, util.Clean(body.Reason), refID)
		if err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, service.ErrInsufficientCredits) {
				status = http.StatusConflict
			}
			util.WriteError(w, status, creditBillingMessage(err))
			return
		}
		util.WriteJSON(w, http.StatusOK, creditAccountEntryResponse{Account: account, Entry: entry})
	case strings.HasPrefix(path, base+"/cards/") && strings.HasSuffix(path, "/disable"):
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		parts := splitPath(path)
		if len(parts) != 6 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "credits" || parts[3] != "cards" || parts[5] != "disable" {
			http.NotFound(w, r)
			return
		}
		card, err := a.credits.DisableCard(parts[4])
		if err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, service.ErrCreditCardNotFound) {
				status = http.StatusNotFound
			}
			if errors.Is(err, service.ErrCreditCardInactive) {
				status = http.StatusConflict
			}
			util.WriteError(w, status, creditBillingMessage(err))
			return
		}
		util.WriteJSON(w, http.StatusOK, itemResponse[service.CreditCardPublic]{
			Item: service.CreditCardPublicFromCard(card, false),
		})
	case path == base+"/ledger":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		page := util.ToInt(q.Get("page"), 0)
		pageSize := util.ToInt(q.Get("page_size"), 0)
		result, err := a.credits.QueryLedger(service.CreditLedgerQuery{
			Page:     page,
			PageSize: pageSize,
			Keyword:  strings.TrimSpace(q.Get("keyword")),
			Reason:   strings.TrimSpace(q.Get("reason")),
			StartAt:  strings.TrimSpace(q.Get("start_at")),
			EndAt:    strings.TrimSpace(q.Get("end_at")),
		})
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, result)
	case path == base+"/users":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		result, err := a.credits.QueryAccounts(service.CreditAccountsQuery{
			Page:     util.ToInt(q.Get("page"), 0),
			PageSize: util.ToInt(q.Get("page_size"), 0),
			Keyword:  strings.TrimSpace(q.Get("keyword")),
			StartAt:  strings.TrimSpace(q.Get("start_at")),
			EndAt:    strings.TrimSpace(q.Get("end_at")),
		})
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, result)
	default:
		http.NotFound(w, r)
	}
}

func publicCreditCard(card service.CreditCard) service.CreditCardPublic {
	return service.CreditCardPublicFromCard(card, false)
}
