package app

import (
	"strings"
	"time"
	"unicode/utf8"
)

const mailboxTagMaxLength = 24

var mailboxTagColors = map[string]struct{}{
	"slate":  {},
	"blue":   {},
	"green":  {},
	"amber":  {},
	"red":    {},
	"violet": {},
}

func (s *FileStore) SetMailboxTag(id, tag, color string) (Mailbox, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(id)
	if idx < 0 {
		return Mailbox{}, errCode("mailbox_not_found", "邮箱不存在", false)
	}
	tag = strings.TrimSpace(tag)
	color = strings.ToLower(strings.TrimSpace(color))
	if utf8.RuneCountInString(tag) > mailboxTagMaxLength {
		return Mailbox{}, errCode("mailbox_tag_too_long", "邮箱标记不能超过 24 个字符", false)
	}
	if tag == "" {
		color = ""
	} else if color == "" {
		color = "blue"
	} else if _, ok := mailboxTagColors[color]; !ok {
		return Mailbox{}, errCode("invalid_mailbox_tag_color", "邮箱标记颜色无效", false)
	}
	s.state.Mailboxes[idx].Tag = tag
	s.state.Mailboxes[idx].TagColor = color
	s.state.Mailboxes[idx].UpdatedAt = time.Now()
	return s.state.Mailboxes[idx], s.saveLocked()
}
