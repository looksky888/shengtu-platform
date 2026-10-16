package app

import (
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
		"对照 gptGrok2api-1.0.4：取码登录仅用 LOGIN/PLAIN + App 专用密码，与网页「新/旧接口」检测无关。" +
		"请逐项核对：" +
		"1) 账号必须是生成 App 专用密码的那个 Apple ID（你当前为 邮箱类 Apple ID，如 *@qq.com），不要填隐私邮箱；" +
		"2) 密码必须是 appleid.apple.com 或 appleid.apple.com.cn → 登录与安全 → App 专用密码（16 位小写，可带横杠），" +
		"绝对不是 iCloud/Apple ID 网页登录密码；" +
		"3) 该 Apple ID 必须已开启双重认证，否则无法生成有效 App 专用密码；" +
		"4) 在官网作废旧密码后重新生成一份，粘贴时不要多复制空格/中文标点；" +
		"5) 若账号在中国区，请到 appleid.apple.com.cn 生成 App 专用密码后再试。"
	if email != "" {
		hint = "账号 " + email + " " + hint
	}
	if summary != "" {
		hint += " 上游：" + summary
	}
	return hint
}
