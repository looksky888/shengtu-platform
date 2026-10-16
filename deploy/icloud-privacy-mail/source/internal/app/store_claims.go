package app

import (
	"strings"
	"time"
)

func (s *FileStore) ClaimAvailableMailbox(project, note string) (Mailbox, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// OpenAI/Grok "claim" only soft-locks a free mailbox for the in-flight register.
	// OpenAIClaimed / GrokClaimed mean "registration succeeded" and are set only via
	// SetMailboxClaimed(project, emails, true) after the register worker succeeds.
	project = normalizeMailboxClaimProject(project)
	for i, mailbox := range s.state.Mailboxes {
		if !mailbox.APIActive || !mailbox.ICloudActive {
			continue
		}
		switch project {
		case "openai":
			// Already GPT-registered, or soft-locked / used without a shared Grok hold.
			if mailbox.OpenAIClaimed || (mailbox.Status != StatusAvailable && !mailbox.GrokClaimed) {
				continue
			}
			// Soft-lock so concurrent register tasks do not pick the same alias.
			s.state.Mailboxes[i].Status = StatusUsed
		case "grok":
			if mailbox.GrokClaimed || (mailbox.Status != StatusAvailable && !mailbox.OpenAIClaimed) {
				continue
			}
			s.state.Mailboxes[i].Status = StatusUsed
		default:
			if mailbox.Status != StatusAvailable || mailbox.OpenAIClaimed || mailbox.GrokClaimed {
				continue
			}
			s.state.Mailboxes[i].Status = StatusUsed
		}
		if strings.TrimSpace(note) != "" {
			s.state.Mailboxes[i].Note = mergeMailboxClaimNote(s.state.Mailboxes[i].Note, note)
		}
		s.state.Mailboxes[i].UpdatedAt = time.Now()
		return s.state.Mailboxes[i], s.saveLocked()
	}
	return Mailbox{}, errCode("no_available_mailbox", "没有可用隐私邮箱", false)
}

func normalizeMailboxClaimProject(project string) string {
	switch strings.ToLower(strings.TrimSpace(project)) {
	case "openai", "chatgpt", "gpt":
		return "openai"
	case "grok", "xai", "x.ai":
		return "grok"
	default:
		return ""
	}
}

func (s *FileStore) SetMailboxClaimed(project string, emails []string, claimed bool) (int, []string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	project = normalizeMailboxClaimProject(project)
	if project == "" {
		return 0, nil, errCode("invalid_project", "project 必须是 openai 或 grok", false)
	}
	seen := make(map[string]struct{}, len(emails))
	missing := make([]string, 0)
	updated := 0
	for _, rawEmail := range emails {
		email := strings.ToLower(strings.TrimSpace(rawEmail))
		if email == "" {
			continue
		}
		if _, ok := seen[email]; ok {
			continue
		}
		seen[email] = struct{}{}
		index := -1
		for i := range s.state.Mailboxes {
			if strings.EqualFold(s.state.Mailboxes[i].Email, email) {
				index = i
				break
			}
		}
		if index < 0 {
			missing = append(missing, email)
			continue
		}
		mailbox := &s.state.Mailboxes[index]
		if project == "openai" {
			mailbox.OpenAIClaimed = claimed
		} else {
			mailbox.GrokClaimed = claimed
		}
		// Success → permanent "registered" flag + note.
		// Failure / release → clear soft-lock and in-progress notes; only keep success notes for projects still marked.
		mailbox.Note = applyMailboxRegisterNote(mailbox.Note, project, claimed, mailbox.OpenAIClaimed, mailbox.GrokClaimed)
		if mailbox.OpenAIClaimed && mailbox.GrokClaimed {
			mailbox.Status = StatusUsed
		} else if mailbox.OpenAIClaimed || mailbox.GrokClaimed {
			// Registered for one project only: still free for the other project to soft-claim later.
			mailbox.Status = StatusAvailable
		} else if mailbox.Status == StatusUsed {
			// Release soft-lock from an in-flight claim that failed.
			mailbox.Status = StatusAvailable
		}
		mailbox.UpdatedAt = time.Now()
		updated++
	}
	if updated > 0 {
		if err := s.saveLocked(); err != nil {
			return 0, missing, err
		}
	}
	return updated, missing, nil
}

func mergeMailboxClaimNote(existing, incoming string) string {
	existing = strings.TrimSpace(existing)
	incoming = strings.TrimSpace(incoming)
	if incoming == "" {
		return existing
	}
	if existing == "" {
		return incoming
	}
	// Prefer replacing a previous in-progress / legacy claim note rather than stacking duplicates.
	if isMailboxClaimNote(existing) {
		return incoming
	}
	if strings.Contains(existing, incoming) {
		return existing
	}
	return existing + "；" + incoming
}

func isMailboxClaimNote(note string) bool {
	n := strings.TrimSpace(note)
	return strings.HasPrefix(n, "外部 API 已领取") ||
		strings.HasPrefix(n, "外部 API 注册中") ||
		strings.HasPrefix(n, "外部 API 已注册") ||
		strings.HasPrefix(n, "注册占用中") ||
		strings.HasPrefix(n, "GPT 注册成功") ||
		strings.HasPrefix(n, "Grok 注册成功")
}

func applyMailboxRegisterNote(existing, project string, claimed, openaiClaimed, grokClaimed bool) string {
	existing = stripMailboxClaimSegments(strings.TrimSpace(existing))
	if claimed {
		switch project {
		case "openai":
			return mergeMailboxClaimNote(existing, "外部 API 已注册：openai")
		case "grok":
			return mergeMailboxClaimNote(existing, "外部 API 已注册：grok")
		default:
			return mergeMailboxClaimNote(existing, "外部 API 已注册")
		}
	}
	// On release: keep success notes only for projects still marked registered.
	parts := make([]string, 0, 2)
	if openaiClaimed {
		parts = append(parts, "外部 API 已注册：openai")
	}
	if grokClaimed {
		parts = append(parts, "外部 API 已注册：grok")
	}
	if len(parts) == 0 {
		return existing
	}
	joined := strings.Join(parts, "；")
	if existing == "" {
		return joined
	}
	return existing + "；" + joined
}

func stripMailboxClaimSegments(note string) string {
	if note == "" {
		return ""
	}
	parts := strings.Split(note, "；")
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || isMailboxClaimNote(part) {
			continue
		}
		// Also drop claim fragments embedded after a free-form create note.
		lower := strings.ToLower(part)
		if strings.Contains(lower, "外部 api 注册中") ||
			strings.Contains(lower, "外部 api 已领取") ||
			strings.Contains(lower, "外部 api 已注册") ||
			strings.Contains(lower, "注册占用中") {
			continue
		}
		kept = append(kept, part)
	}
	return strings.Join(kept, "；")
}
