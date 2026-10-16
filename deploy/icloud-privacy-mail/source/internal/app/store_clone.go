package app

func cloneState(in State) State {
	out := in
	out.Users = append([]User(nil), in.Users...)
	out.WebSessions = append([]WebSession(nil), in.WebSessions...)
	out.Accounts = append([]Account(nil), in.Accounts...)
	out.Mailboxes = append([]Mailbox(nil), in.Mailboxes...)
	out.Messages = append([]Message(nil), in.Messages...)
	if in.ICloudSession != nil {
		session := cloneICloudSession(*in.ICloudSession)
		out.ICloudSession = &session
	}
	out.ICloudSessions = cloneICloudSessions(in.ICloudSessions)
	out.CreateSettings = cloneCreateSettings(in.CreateSettings)
	return out
}

func cloneICloudSession(in ICloudSession) ICloudSession {
	out := in
	out.Cookies = append([]SessionCookie(nil), in.Cookies...)
	out.LoginStates = cloneLoginStates(in.LoginStates)
	return out
}

func mergeICloudSession(existing, incoming ICloudSession) ICloudSession {
	out := incoming
	out.OwnerID = firstNonEmpty(incoming.OwnerID, existing.OwnerID)
	out.AccountID = firstNonEmpty(incoming.AccountID, existing.AccountID)
	if out.SavedAt.IsZero() {
		out.SavedAt = existing.SavedAt
	}
	out.AppleID = firstNonEmpty(incoming.AppleID, existing.AppleID)
	out.DSID = firstNonEmpty(incoming.DSID, existing.DSID)
	out.ClientID = firstNonEmpty(incoming.ClientID, existing.ClientID)
	out.ClientBuildNumber = firstNonEmpty(incoming.ClientBuildNumber, existing.ClientBuildNumber)
	out.MasteringNumber = firstNonEmpty(incoming.MasteringNumber, existing.MasteringNumber)
	out.PremiumMailBaseURL = firstNonEmpty(incoming.PremiumMailBaseURL, existing.PremiumMailBaseURL)
	out.MailGatewayBaseURL = firstNonEmpty(incoming.MailGatewayBaseURL, existing.MailGatewayBaseURL)
	out.MailBaseURL = firstNonEmpty(incoming.MailBaseURL, existing.MailBaseURL)
	out.Host = firstNonEmpty(incoming.Host, existing.Host)
	out.IsICloudPlus = incoming.IsICloudPlus || existing.IsICloudPlus
	out.CanCreateHME = incoming.CanCreateHME || existing.CanCreateHME
	if len(out.Cookies) == 0 {
		out.Cookies = append([]SessionCookie(nil), existing.Cookies...)
	}
	out.LoginStates = mergeLoginStates(existing.LoginStates, incoming.LoginStates)
	out.Note = firstNonEmpty(incoming.Note, existing.Note)
	if out.LastCheckedAt.IsZero() {
		out.LastCheckedAt = existing.LastCheckedAt
	}
	if !incoming.LastCheckOK {
		out.LastCheckOK = existing.LastCheckOK
	}
	out.LastStatusMessage = firstNonEmpty(incoming.LastStatusMessage, existing.LastStatusMessage)
	return out
}

func mergeLoginStates(existing, incoming []LoginState) []LoginState {
	out := cloneLoginStates(existing)
	for _, state := range incoming {
		replaced := false
		for i, current := range out {
			if current.Kind == state.Kind {
				next := state
				next.Cookies = append([]SessionCookie(nil), state.Cookies...)
				out[i] = next
				replaced = true
				break
			}
		}
		if !replaced {
			next := state
			next.Cookies = append([]SessionCookie(nil), state.Cookies...)
			out = append(out, next)
		}
	}
	return out
}

func cloneLoginStates(in []LoginState) []LoginState {
	out := make([]LoginState, 0, len(in))
	for _, state := range in {
		next := state
		next.Cookies = append([]SessionCookie(nil), state.Cookies...)
		out = append(out, next)
	}
	return out
}

func cloneICloudSessions(in []ICloudSession) []ICloudSession {
	out := make([]ICloudSession, 0, len(in))
	for _, session := range in {
		out = append(out, cloneICloudSession(session))
	}
	return out
}

func cloneCreateSettings(in []CreateSettings) []CreateSettings {
	out := make([]CreateSettings, 0, len(in))
	for _, settings := range in {
		next := settings
		next.AccountIDs = append([]string(nil), settings.AccountIDs...)
		out = append(out, next)
	}
	return out
}

func filterStateByOwnerLocked(in State, ownerID string) State {
	if ownerID == "" {
		return cloneState(in)
	}
	out := State{NextID: in.NextID}
	for _, user := range in.Users {
		if user.ID == ownerID {
			out.Users = append(out.Users, user)
			break
		}
	}
	for _, account := range in.Accounts {
		if constantTimeEqual(ownerID, account.OwnerID) {
			out.Accounts = append(out.Accounts, account)
		}
	}
	allowedMailboxes := make(map[string]struct{})
	for _, mailbox := range in.Mailboxes {
		if constantTimeEqual(ownerID, mailbox.OwnerID) {
			out.Mailboxes = append(out.Mailboxes, mailbox)
			allowedMailboxes[mailbox.ID] = struct{}{}
		}
	}
	for _, msg := range in.Messages {
		if _, ok := allowedMailboxes[msg.MailboxID]; ok || constantTimeEqual(ownerID, msg.OwnerID) {
			out.Messages = append(out.Messages, msg)
		}
	}
	for _, session := range in.ICloudSessions {
		if constantTimeEqual(ownerID, session.OwnerID) {
			cloned := cloneICloudSession(session)
			if out.ICloudSession == nil {
				first := cloneICloudSession(session)
				out.ICloudSession = &first
			}
			out.ICloudSessions = append(out.ICloudSessions, cloned)
		}
	}
	for _, settings := range in.CreateSettings {
		if constantTimeEqual(ownerID, settings.OwnerID) {
			next := settings
			next.AccountIDs = append([]string(nil), settings.AccountIDs...)
			out.CreateSettings = append(out.CreateSettings, next)
		}
	}
	return out
}
