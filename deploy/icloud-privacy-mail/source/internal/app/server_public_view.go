package app

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func publicUserFromUser(user User) publicUser {
	return publicUser{
		ID:          user.ID,
		Username:    user.Username,
		Status:      user.Status,
		IsAdmin:     user.IsAdmin,
		CreatedAt:   formatTime(user.CreatedAt),
		UpdatedAt:   formatTime(user.UpdatedAt),
		LastLoginAt: formatTime(user.LastLoginAt),
	}
}

func (s *Server) ownerName(ownerID string) string {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return "管理员/全局"
	}
	if user, ok := s.store.UserByID(ownerID); ok {
		return user.Username
	}
	return "旧数据/未知归属"
}

func (s *Server) publicUserSummaries(users []User, state State) []publicUserSummary {
	type counter struct {
		publicUserSummary
	}
	rows := make(map[string]*counter, len(users)+1)
	order := make([]string, 0, len(users)+1)

	ensure := func(ownerID, username string) *counter {
		ownerID = strings.TrimSpace(ownerID)
		if row, ok := rows[ownerID]; ok {
			if row.Username == "" && username != "" {
				row.Username = username
			}
			return row
		}
		if username == "" {
			username = s.ownerName(ownerID)
		}
		row := &counter{publicUserSummary: publicUserSummary{
			OwnerID:  ownerID,
			Username: username,
			Status:   StatusActive,
		}}
		rows[ownerID] = row
		order = append(order, ownerID)
		return row
	}

	for _, user := range users {
		row := ensure(user.ID, user.Username)
		row.Status = user.Status
		row.IsAdmin = user.IsAdmin
		row.LastLoginAt = formatTime(user.LastLoginAt)
	}

	mailboxOwner := make(map[string]string, len(state.Mailboxes))
	for _, account := range state.Accounts {
		ensure(account.OwnerID, "").AccountCount++
	}
	for _, mailbox := range state.Mailboxes {
		row := ensure(mailbox.OwnerID, "")
		row.MailboxCount++
		switch mailbox.Status {
		case StatusAvailable:
			row.AvailableMailboxCount++
		case StatusUsed:
			row.UsedMailboxCount++
		}
		mailboxOwner[mailbox.ID] = mailbox.OwnerID
	}
	for _, msg := range state.Messages {
		ownerID := strings.TrimSpace(msg.OwnerID)
		if ownerID == "" {
			ownerID = mailboxOwner[msg.MailboxID]
		}
		ensure(ownerID, "").MessageCount++
	}
	if state.ICloudSession != nil && (hasCreateLoginState(*state.ICloudSession) || iCloudIMAPLoginSaved(*state.ICloudSession)) {
		ensure("", "管理员/全局").ICloudSessionSaved = true
	}
	for _, session := range state.ICloudSessions {
		if hasCreateLoginState(session) || iCloudIMAPLoginSaved(session) {
			ensure(session.OwnerID, "").ICloudSessionSaved = true
		}
	}

	out := make([]publicUserSummary, 0, len(order))
	for _, ownerID := range order {
		row := rows[ownerID]
		if ownerID == "" && row.AccountCount == 0 && row.MailboxCount == 0 && row.MessageCount == 0 && !row.ICloudSessionSaved {
			continue
		}
		out = append(out, row.publicUserSummary)
	}
	return out
}

func (s *Server) publicAccount(account Account) publicAccount {
	return publicAccount{
		ID:           account.ID,
		OwnerID:      account.OwnerID,
		Owner:        s.ownerName(account.OwnerID),
		Label:        account.Label,
		AppleID:      strings.TrimSpace(account.AppleID),
		Status:       account.Status,
		ICloudStatus: account.ICloudStatus,
		Note:         account.Note,
		CreatedAt:    formatTime(account.CreatedAt),
		UpdatedAt:    formatTime(account.UpdatedAt),
	}
}

func (s *Server) publicMailbox(r *http.Request, mailbox Mailbox) publicMailbox {
	account := Account{}
	if strings.TrimSpace(mailbox.AccountID) != "" {
		if stored, ok := s.store.FindAccountByID(mailbox.AccountID); ok {
			account = stored
		}
	}
	return s.publicMailboxWithRelations(r, mailbox, account, s.ownerName(mailbox.OwnerID))
}

func (s *Server) publicMailboxWithRelations(r *http.Request, mailbox Mailbox, account Account, owner string) publicMailbox {
	return publicMailbox{
		ID:             mailbox.ID,
		OwnerID:        mailbox.OwnerID,
		Owner:          owner,
		AccountID:      mailbox.AccountID,
		AccountLabel:   account.Label,
		AccountAppleID: strings.TrimSpace(account.AppleID),
		Label:          mailbox.Label,
		Email:          mailbox.Email,
		APITokenMask:   maskSecret(mailbox.APIToken, 6),
		APIURL:         s.mailboxAPIURL(r, mailbox),
		APIActive:      mailbox.APIActive,
		ICloudActive:   mailbox.ICloudActive,
		ReceiveCount:   mailbox.ReceiveCount,
		OpenAIClaimed:  mailbox.OpenAIClaimed,
		GrokClaimed:    mailbox.GrokClaimed,
		Status:         mailbox.Status,
		Note:           mailbox.Note,
		Tag:            mailbox.Tag,
		TagColor:       mailbox.TagColor,
		LastSyncAt:     formatTime(mailbox.LastSyncAt),
		LastSyncUID:    mailbox.LastSyncUID,
		CreatedAt:      formatTime(mailbox.CreatedAt),
		UpdatedAt:      formatTime(mailbox.UpdatedAt),
	}
}

func (s *Server) mailboxAPIURL(r *http.Request, mailbox Mailbox) string {
	if isInternalICloudRequest(r) {
		return fmt.Sprintf("/api/icloud/public/v1/mailboxes/%s/code?key=%s", url.PathEscape(mailbox.Email), url.QueryEscape(mailbox.APIToken))
	}
	baseURL := firstNonEmpty(s.cfg.PublicBaseURL, requestBaseURL(r))
	return fmt.Sprintf("%s/api/v1/mailboxes/%s/code?key=%s", strings.TrimRight(baseURL, "/"), url.PathEscape(mailbox.Email), url.QueryEscape(mailbox.APIToken))
}

func (s *Server) publicSession(session *ICloudSession) publicICloudSession {
	interval := s.appleAccountKeepAliveInterval
	if interval <= 0 {
		interval = appleAccountKeepAliveDefaultInterval
	}
	return publicSessionWithKeepAliveInterval(session, interval)
}

func publicSession(session *ICloudSession) publicICloudSession {
	return publicSessionWithKeepAliveInterval(session, appleAccountKeepAliveDefaultInterval)
}

func publicSessionWithKeepAliveInterval(session *ICloudSession, keepAliveInterval time.Duration) publicICloudSession {
	if session == nil {
		return publicICloudSession{
			Saved:              false,
			NeedsManualLogin:   true,
			LastStatusMessage:  "未保存 iCloud 登录态",
			ProviderConfigured: false,
		}
	}
	message := strings.TrimSpace(session.LastStatusMessage)
	if message == "" {
		message = "登录态已保存；Cookie 原文只写入本地 data/state.db，不会返回前端"
	}
	icloudWebLoginSaved := iCloudWebLoginSaved(*session)
	appleAccountLoginSaved := appleAccountLoginSaved(*session)
	icloudIMAPLoginSaved := iCloudIMAPLoginSaved(*session)
	icloudWebState, _ := iCloudWebLoginState(*session)
	appleAccountState, _ := appleAccountLoginState(*session)
	icloudIMAPState, _ := iCloudIMAPLoginState(*session)
	appleAccountNextRefreshAt := time.Time{}
	if appleAccountKeepAliveEligible(*session) && !appleAccountState.LastCheckedAt.IsZero() {
		appleAccountNextRefreshAt = appleAccountState.LastCheckedAt.Add(appleAccountKeepAliveIntervalForSession(*session, keepAliveInterval))
	}
	icloudWebCookiePresent, icloudWebCookieCurrent := namedCookieValidity(icloudWebState.Cookies, iCloudWebAuthUserCookie, time.Now())
	icloudWebLoginUsable := icloudWebLoginSaved && icloudWebCookiePresent && icloudWebCookieCurrent
	icloudWebStateName := loginChannelState(icloudWebLoginSaved, icloudWebState)
	icloudWebStatus := loginStatePublicStatus(icloudWebLoginSaved, icloudWebState)
	if icloudWebLoginSaved && icloudWebCookiePresent && !icloudWebCookieCurrent {
		icloudWebStateName = loginChannelExpired
		icloudWebStatus = "登录态已过期，请重新登录"
	} else if icloudWebLoginSaved && !icloudWebCookiePresent {
		icloudWebStateName = loginChannelError
		icloudWebStatus = "登录态不完整，请重新登录"
	}
	return publicICloudSession{
		Saved:                       true,
		AccountID:                   session.AccountID,
		SavedAt:                     formatTime(session.SavedAt),
		AppleID:                     strings.TrimSpace(session.AppleID),
		DSIDMask:                    maskSecret(session.DSID, 4),
		ClientBuildNumber:           session.ClientBuildNumber,
		MasteringNumber:             session.MasteringNumber,
		PremiumMailBaseURL:          session.PremiumMailBaseURL,
		MailGatewayBaseURL:          session.MailGatewayBaseURL,
		MailBaseURL:                 session.MailBaseURL,
		Host:                        session.Host,
		IsICloudPlus:                session.IsICloudPlus,
		CanCreateHME:                session.CanCreateHME,
		CookieCount:                 len(session.Cookies),
		ICloudWebLoginSaved:         icloudWebLoginSaved,
		ICloudWebLoginChecked:       !icloudWebState.LastCheckedAt.IsZero(),
		ICloudWebLoginOK:            icloudWebLoginUsable && icloudWebState.LastCheckOK,
		ICloudWebLoginState:         icloudWebStateName,
		ICloudWebLoginStatus:        icloudWebStatus,
		AppleAccountLoginSaved:      appleAccountLoginSaved,
		AppleAccountLoginChecked:    !appleAccountState.LastCheckedAt.IsZero(),
		AppleAccountLoginOK:         appleAccountState.LastCheckOK,
		AppleAccountLoginState:      loginChannelState(appleAccountLoginSaved, appleAccountState),
		AppleAccountLoginStatus:     loginStatePublicStatus(appleAccountLoginSaved, appleAccountState),
		AppleAccountNextRefreshAt:   formatTime(appleAccountNextRefreshAt),
		AppleAccountManageExpiresAt: formatTime(appleAccountState.ManageExpiresAt),
		AppleAccountManageReady:     appleAccountManageReady(*session),
		ICloudIMAPLoginSaved:        icloudIMAPLoginSaved,
		ICloudIMAPLoginChecked:      !icloudIMAPState.LastCheckedAt.IsZero(),
		ICloudIMAPLoginOK:           icloudIMAPState.LastCheckOK,
		ICloudIMAPLoginState:        loginChannelState(icloudIMAPLoginSaved, icloudIMAPState),
		ICloudIMAPLoginStatus:       loginStatePublicStatus(icloudIMAPLoginSaved, icloudIMAPState),
		ICloudIMAPEmail:             normalizeICloudIMAPEmail(icloudIMAPState.IMAPEmail),
		ICloudIMAPHost:              firstNonEmpty(strings.TrimSpace(icloudIMAPState.IMAPHost), strings.TrimSpace(icloudIMAPState.Host)),
		ProviderConfigured:          session.IsICloudPlus && session.CanCreateHME && icloudWebLoginUsable,
		NeedsManualLogin:            !icloudWebLoginSaved && !appleAccountLoginSaved && !icloudIMAPLoginSaved,
		LastCheckedAt:               formatTime(session.LastCheckedAt),
		LastCheckOK:                 session.LastCheckOK,
		LastStatusMessage:           message,
	}
}

// Login channel machine for UI chips: absent | saved | ok | error | expired.
const (
	loginChannelAbsent  = "absent"
	loginChannelSaved   = "saved"
	loginChannelOK      = "ok"
	loginChannelError   = "error"
	loginChannelExpired = "expired"
)

func loginChannelState(saved bool, state LoginState) string {
	if !saved {
		return loginChannelAbsent
	}
	if state.LastCheckedAt.IsZero() {
		return loginChannelSaved
	}
	if state.LastCheckOK {
		return loginChannelOK
	}
	return loginChannelError
}

func loginStatePublicStatus(saved bool, state LoginState) string {
	switch loginChannelState(saved, state) {
	case loginChannelAbsent:
		return "未登录"
	case loginChannelSaved:
		return "已登录"
	case loginChannelOK:
		return "登录态正常"
	default:
		return "登录态异常"
	}
}

func iCloudWebLoginSaved(session ICloudSession) bool {
	if len(session.Cookies) > 0 {
		return true
	}
	for _, state := range session.LoginStates {
		if state.Kind == LoginStateICloudWeb && len(state.Cookies) > 0 {
			return true
		}
	}
	return false
}

func iCloudWebLoginState(session ICloudSession) (LoginState, bool) {
	for _, state := range session.LoginStates {
		if state.Kind == LoginStateICloudWeb && len(state.Cookies) > 0 {
			return state, true
		}
	}
	if len(session.Cookies) == 0 {
		return LoginState{}, false
	}
	return LoginState{
		Kind:      LoginStateICloudWeb,
		Host:      session.Host,
		Origin:    iCloudOrigin(session),
		SavedAt:   session.SavedAt,
		Cookies:   append([]SessionCookie(nil), session.Cookies...),
		UserAgent: appleAuthUserAgent,
		Note:      "iCloud webservices login state",
	}, true
}

func withICloudWebLoginState(session ICloudSession, next LoginState) ICloudSession {
	next.Kind = LoginStateICloudWeb
	if len(next.Cookies) == 0 && len(session.Cookies) > 0 {
		next.Cookies = append([]SessionCookie(nil), session.Cookies...)
	}
	for i, state := range session.LoginStates {
		if state.Kind == LoginStateICloudWeb {
			session.LoginStates[i] = next
			return session
		}
	}
	session.LoginStates = append(session.LoginStates, next)
	return session
}

func iCloudIMAPLoginSaved(session ICloudSession) bool {
	_, ok := iCloudIMAPLoginState(session)
	return ok
}

func iCloudIMAPLoginState(session ICloudSession) (LoginState, bool) {
	for _, state := range session.LoginStates {
		if state.Kind != LoginStateICloudIMAP {
			continue
		}
		email := normalizeICloudIMAPEmail(state.IMAPEmail)
		if email == "" {
			email = normalizeICloudIMAPEmail(session.AppleID)
		}
		if email == "" || strings.TrimSpace(state.IMAPAppPassword) == "" {
			continue
		}
		state.IMAPEmail = email
		state.IMAPUsername = firstNonEmpty(strings.TrimSpace(state.IMAPUsername), email)
		state.IMAPHost = firstNonEmpty(strings.TrimSpace(state.IMAPHost), defaultICloudIMAPHost)
		if state.IMAPPort == 0 {
			state.IMAPPort = defaultICloudIMAPPort
		}
		return state, true
	}
	return LoginState{}, false
}

func withICloudIMAPLoginState(session ICloudSession, next LoginState) ICloudSession {
	next.Kind = LoginStateICloudIMAP
	next.IMAPEmail = normalizeICloudIMAPEmail(firstNonEmpty(next.IMAPEmail, session.AppleID))
	next.IMAPUsername = firstNonEmpty(strings.TrimSpace(next.IMAPUsername), next.IMAPEmail)
	next.IMAPHost = firstNonEmpty(strings.TrimSpace(next.IMAPHost), defaultICloudIMAPHost)
	next.Host = firstNonEmpty(strings.TrimSpace(next.Host), next.IMAPHost)
	next.Origin = firstNonEmpty(strings.TrimSpace(next.Origin), "imaps://"+next.IMAPHost)
	if next.IMAPPort == 0 {
		next.IMAPPort = defaultICloudIMAPPort
	}
	for i, state := range session.LoginStates {
		if state.Kind == LoginStateICloudIMAP {
			session.LoginStates[i] = next
			return session
		}
	}
	session.LoginStates = append(session.LoginStates, next)
	return session
}

func appleAccountLoginSaved(session ICloudSession) bool {
	_, ok := appleAccountLoginState(session)
	return ok
}

func normalizeICloudIMAPEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func publicSessionForAppleID(sessions []publicICloudSession, appleID string) publicICloudSession {
	appleID = strings.TrimSpace(appleID)
	for _, session := range sessions {
		if appleID != "" && strings.EqualFold(strings.TrimSpace(session.AppleID), appleID) {
			return session
		}
	}
	if len(sessions) > 0 {
		return sessions[0]
	}
	return publicSession(nil)
}

func publicSessionForAccountID(sessions []publicICloudSession, accountID string) publicICloudSession {
	accountID = strings.TrimSpace(accountID)
	for _, session := range sessions {
		if accountID != "" && constantTimeEqual(strings.TrimSpace(session.AccountID), accountID) {
			return session
		}
	}
	if len(sessions) > 0 {
		return sessions[0]
	}
	return publicSession(nil)
}
