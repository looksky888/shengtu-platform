package app

import (
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

func (s *Server) handleListAccounts(w http.ResponseWriter, r *http.Request) {
	state := s.scopedMailboxListState(r)
	out := make([]publicAccount, 0, len(state.Accounts))
	for _, account := range state.Accounts {
		out = append(out, s.publicAccount(account))
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "accounts": out})
}

func (s *Server) handleCreateAccount(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Label   string `json:"label"`
		AppleID string `json:"apple_id"`
		Note    string `json:"note"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	account, err := s.store.AddAccountForOwner(requestOwnerID(r, s.store), payload.Label, payload.AppleID, payload.Note)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"success": true, "account": account})
}

func (s *Server) handleListMailboxes(w http.ResponseWriter, r *http.Request) {
	usage, err := parseMailboxUsageFilter(r.URL.Query().Get("usage"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	state := s.scopedMailboxListState(r)
	accountsByID := mailboxAccountMap(state.Accounts)
	ownerNamesByID := mailboxOwnerNameMap(state.Users)
	base := filterMailboxesByOwner(state.Mailboxes, strings.TrimSpace(r.URL.Query().Get("owner_id")), scopedOwnerID(r, s.store), s.isAdminRequest(r))
	groups := publicMailboxGroups(base, accountsByID)
	filtered := filterMailboxesForList(base, accountsByID, r.URL.Query(), usage)
	sortMailboxesForList(filtered, accountsByID)

	page, pageSize, paged := mailboxListPagination(r)
	pageRows := filtered
	if paged {
		pageRows = paginateMailboxes(filtered, page, pageSize)
	}
	out := make([]publicMailbox, 0, len(pageRows))
	for _, mailbox := range pageRows {
		account := accountsByID[strings.TrimSpace(mailbox.AccountID)]
		owner := mailboxListOwnerName(mailbox.OwnerID, ownerNamesByID)
		out = append(out, s.publicMailboxWithRelations(r, mailbox, account, owner))
	}
	response := map[string]any{
		"success":   true,
		"mailboxes": out,
		"groups":    groups,
		"summary":   summarizeMailboxes(base),
		"pagination": publicPagination{
			Page:       page,
			PageSize:   pageSize,
			Total:      len(filtered),
			TotalAll:   len(base),
			TotalPages: totalPages(len(filtered), pageSize),
		},
	}
	writeJSON(w, http.StatusOK, response)
}

func summarizeMailboxes(mailboxes []Mailbox) map[string]int {
	openAIClaimed := 0
	for _, mailbox := range mailboxes {
		if mailbox.OpenAIClaimed {
			openAIClaimed++
		}
	}
	return map[string]int{
		"total":          len(mailboxes),
		"openai_claimed": openAIClaimed,
	}
}

func filterMailboxesByOwner(mailboxes []Mailbox, ownerFilter, scopedOwner string, admin bool) []Mailbox {
	ownerFilter = strings.TrimSpace(ownerFilter)
	if ownerFilter == "" || ownerFilter == "all" {
		return append([]Mailbox(nil), mailboxes...)
	}
	if !admin {
		scopedOwner = strings.TrimSpace(scopedOwner)
		if scopedOwner == "" || !constantTimeEqual(scopedOwner, ownerFilter) {
			return nil
		}
	}
	out := make([]Mailbox, 0, len(mailboxes))
	for _, mailbox := range mailboxes {
		if constantTimeEqual(strings.TrimSpace(mailbox.OwnerID), ownerFilter) {
			out = append(out, mailbox)
		}
	}
	return out
}

func filterMailboxesForList(mailboxes []Mailbox, accountsByID map[string]Account, values url.Values, usage string) []Mailbox {
	accountKey := strings.TrimSpace(firstNonEmpty(values.Get("account_key"), values.Get("account_id")))
	keyword := strings.ToLower(strings.TrimSpace(firstNonEmpty(values.Get("search"), values.Get("q"))))
	out := make([]Mailbox, 0, len(mailboxes))
	for _, mailbox := range mailboxes {
		used := mailboxUsedForList(mailbox)
		if usage == "used" && !used {
			continue
		}
		if usage == "unused" && used {
			continue
		}
		if keyword == "" && accountKey != "" && accountKey != "all" && !constantTimeEqual(mailboxListAccountKey(mailbox, accountsByID), accountKey) {
			continue
		}
		if keyword != "" && !mailboxListMatchesSearch(mailbox, accountsByID, keyword) {
			continue
		}
		out = append(out, mailbox)
	}
	return out
}

func mailboxUsedForList(mailbox Mailbox) bool {
	if mailbox.OpenAIClaimed || mailbox.GrokClaimed {
		return true
	}
	normalizedTag := strings.ToLower(strings.Join(strings.Fields(mailbox.Tag), ""))
	switch normalizedTag {
	case "gpt已注册", "openai已注册", "grok已注册", "已使用":
		return true
	default:
		return false
	}
}

func parseMailboxUsageFilter(value string) (string, error) {
	switch normalized := strings.ToLower(strings.TrimSpace(value)); normalized {
	case "", "all":
		return "", nil
	case "unused", "used":
		return normalized, nil
	default:
		return "", errCode("invalid_usage_filter", "usage 只能是 all、unused 或 used", false)
	}
}

func mailboxListMatchesSearch(mailbox Mailbox, accountsByID map[string]Account, keyword string) bool {
	account := accountsByID[strings.TrimSpace(mailbox.AccountID)]
	haystack := strings.ToLower(strings.Join([]string{
		mailbox.Email,
		mailbox.Label,
		mailbox.ID,
		mailbox.AccountID,
		account.Label,
		account.AppleID,
		mailbox.Status,
		mailbox.Note,
		mailbox.Tag,
		mailbox.OwnerID,
	}, " "))
	return strings.Contains(haystack, keyword)
}

func sortMailboxesForList(mailboxes []Mailbox, _ map[string]Account) {
	sort.SliceStable(mailboxes, func(i, j int) bool {
		leftCreated := mailboxes[i].CreatedAt
		rightCreated := mailboxes[j].CreatedAt
		if leftCreated.IsZero() != rightCreated.IsZero() {
			return !leftCreated.IsZero()
		}
		if !leftCreated.Equal(rightCreated) {
			return leftCreated.After(rightCreated)
		}
		leftEmail := strings.ToLower(mailboxes[i].Email)
		rightEmail := strings.ToLower(mailboxes[j].Email)
		if leftEmail != rightEmail {
			return leftEmail < rightEmail
		}
		return mailboxes[i].ID < mailboxes[j].ID
	})
}

func paginateMailboxes(mailboxes []Mailbox, page, pageSize int) []Mailbox {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = mailboxListDefaultPageSize
	}
	start := (page - 1) * pageSize
	if start >= len(mailboxes) {
		return nil
	}
	end := start + pageSize
	if end > len(mailboxes) {
		end = len(mailboxes)
	}
	return mailboxes[start:end]
}

func mailboxListPagination(r *http.Request) (int, int, bool) {
	values := r.URL.Query()
	paged := values.Has("page") || values.Has("page_size") || values.Has("search") || values.Has("q") || values.Has("account_key") || values.Has("account_id") || values.Has("owner_id") || values.Has("usage")
	page := parseBoundedPositiveInt(values.Get("page"), 1, 1, 1_000_000)
	pageSize := parseBoundedPositiveInt(values.Get("page_size"), mailboxListDefaultPageSize, 1, mailboxListMaxPageSize)
	return page, pageSize, paged
}

func parseBoundedPositiveInt(value string, fallback, minValue, maxValue int) int {
	n, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	if n < minValue {
		return minValue
	}
	if n > maxValue {
		return maxValue
	}
	return n
}

func totalPages(total, pageSize int) int {
	if pageSize < 1 {
		pageSize = mailboxListDefaultPageSize
	}
	if total <= 0 {
		return 1
	}
	return (total + pageSize - 1) / pageSize
}

func mailboxAccountMap(accounts []Account) map[string]Account {
	out := make(map[string]Account, len(accounts))
	for _, account := range accounts {
		if strings.TrimSpace(account.ID) != "" {
			out[account.ID] = account
		}
	}
	return out
}

func mailboxOwnerNameMap(users []User) map[string]string {
	out := make(map[string]string, len(users))
	for _, user := range users {
		if id := strings.TrimSpace(user.ID); id != "" {
			out[id] = strings.TrimSpace(user.Username)
		}
	}
	return out
}

func mailboxListOwnerName(ownerID string, ownerNamesByID map[string]string) string {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return "管理员/全局"
	}
	if name := strings.TrimSpace(ownerNamesByID[ownerID]); name != "" {
		return name
	}
	return "旧数据/未知归属"
}

func publicMailboxGroups(mailboxes []Mailbox, accountsByID map[string]Account) []publicMailboxGroup {
	byKey := map[string]publicMailboxGroup{}
	for _, mailbox := range mailboxes {
		key := mailboxListAccountKey(mailbox, accountsByID)
		group := byKey[key]
		if group.Key == "" {
			group = publicMailboxGroup{
				Key:       key,
				Title:     mailboxListAccountTitle(mailbox, accountsByID),
				AccountID: strings.TrimSpace(mailbox.AccountID),
			}
		}
		group.Count++
		byKey[key] = group
	}
	groups := make([]publicMailboxGroup, 0, len(byKey))
	for _, group := range byKey {
		groups = append(groups, group)
	}
	sort.Slice(groups, func(i, j int) bool {
		return strings.ToLower(groups[i].Title) < strings.ToLower(groups[j].Title)
	})
	return groups
}

func mailboxListAccountKey(mailbox Mailbox, accountsByID map[string]Account) string {
	if strings.TrimSpace(mailbox.AccountID) != "" {
		return strings.TrimSpace(mailbox.AccountID)
	}
	return "unbound"
}

func mailboxListAccountTitle(mailbox Mailbox, accountsByID map[string]Account) string {
	account := accountsByID[strings.TrimSpace(mailbox.AccountID)]
	return firstNonEmpty(account.Label, account.AppleID, mailbox.AccountID, "未绑定 Apple 账号")
}
