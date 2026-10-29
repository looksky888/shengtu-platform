package app

import (
	"fmt"
	"strings"
)

// normalizeICloudAppPassword removes whitespace / zero-width / fullwidth separators.
// Hyphens are kept so callers can still try the pasted "xxxx-xxxx-xxxx-xxxx" form.
func normalizeICloudAppPassword(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(value))
	for _, r := range value {
		switch r {
		case ' ', '\t', '\r', '\n', '\u00a0', '\u200b', '\u200c', '\u200d', '\ufeff':
			continue
		case '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\uff0d': // unicode/fullwidth hyphens → ASCII
			b.WriteByte('-')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func appPasswordLoginCandidates(appPassword string) []string {
	// 1) Reference path: outer TrimSpace only (gptGrok2api-1.0.4).
	raw := strings.TrimSpace(appPassword)
	// 2) Cleaned form (spaces / zero-width / fullwidth hyphens).
	cleaned := normalizeICloudAppPassword(appPassword)
	// 3) Compact (no hyphens).
	compact := strings.ReplaceAll(cleaned, "-", "")
	// 4) Lowercase compact — Apple app-specific passwords are lowercase a-z.
	lowerCompact := strings.ToLower(compact)

	out := make([]string, 0, 4)
	seen := map[string]struct{}{}
	add := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" {
			return
		}
		if _, ok := seen[v]; ok {
			return
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	add(raw)
	add(cleaned)
	add(compact)
	add(lowerCompact)
	return out
}

var commonEmailDomainTypos = map[string]string{
	"icoud.com":     "icloud.com",
	"iclod.com":     "icloud.com",
	"icluod.com":    "icloud.com",
	"iclould.com":   "icloud.com",
	"icload.com":    "icloud.com",
	"ilcoud.com":    "icloud.com",
	"icloud.con":    "icloud.com",
	"icloud.cmo":    "icloud.com",
	"icloud.cm":     "icloud.com",
	"icoud.cn":      "icloud.com",
	"icloud.cn":     "icloud.com",
	"icloud.com.cn": "icloud.com",
	"qq.con":        "qq.com",
	"qq.cmo":        "qq.com",
	"163.con":       "163.com",
	"gmail.con":     "gmail.com",
}

func detectICloudEmailDomainTypo(email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return nil
	}
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 || strings.Contains(email[:at], "@") {
		return errCode("imap_email_invalid", "邮箱地址格式不正确，请输入完整的 Apple ID 或 @icloud.com 主邮箱地址", false)
	}
	local := email[:at]
	domain := email[at+1:]
	if suggested, ok := commonEmailDomainTypos[domain]; ok {
		return errCode(
			"imap_email_typo",
			fmt.Sprintf("邮箱域名疑似输入有误：当前为 @%s，建议改为 %s@%s 后重新保存", domain, local, suggested),
			false,
		)
	}
	if !strings.Contains(domain, ".") {
		return errCode("imap_email_invalid", "邮箱域名格式不正确，请检查 @ 后面的后缀是否完整（例如 @icloud.com 或 @qq.com）", false)
	}
	return nil
}

// looksLikeHideMyEmailAddress detects randomly generated iCloud privacy addresses that
// cannot be used as IMAP login usernames (login must be Apple ID / primary iCloud mail).
func looksLikeHideMyEmailAddress(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return false
	}
	local := email[:at]
	domain := email[at+1:]
	if domain != "icloud.com" && domain != "me.com" && domain != "mac.com" {
		return false
	}
	// Privacy addresses often look like word_word_hex@icloud.com (e.g. masons_tells_4b@icloud.com).
	return strings.Count(local, "_") >= 2
}

func imapAuthFailedMessage(email, summary string) string {
	email = strings.TrimSpace(email)
	hint := "iCloud IMAP 认证失败（AUTHENTICATIONFAILED）。" +
		"请逐项核对：" +
		"1) 账号请填写该 Apple ID 的 @icloud.com 主邮箱别名（如 l3579524213@icloud.com）或生成该密码的 Apple ID（如 *@qq.com），不要填隐私邮箱；" +
		"2) 密码必须是 account.apple.com → 登录与安全 → App 专用密码（16 位小写字母，可带横杠），不是 Apple ID 登录密码；" +
		"3) 该 Apple ID 需已在 iCloud 中开通「iCloud 邮件」并创建过主 @icloud.com 邮箱地址；" +
		"4) 若仍失败，请在 Apple 官网作废旧的 App 专用密码后重新生成一份再试。"
	if email != "" {
		hint = "账号 " + email + " " + hint
	}
	if summary != "" {
		hint += " 上游：" + summary
	}
	return hint
}
