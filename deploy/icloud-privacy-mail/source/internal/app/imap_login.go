package app

import (
	"bufio"
	"context"
	"encoding/base64"
	"net"
	"strings"
	"time"
)

func CheckICloudIMAPLogin(ctx context.Context, email, appPassword string) error {
	// Keep email normalization aligned with gptGrok2api-1.0.4 reference.
	email = normalizeICloudIMAPEmail(email)
	if email == "" {
		return errCode("imap_email_missing", "请输入 iCloud 邮箱账号", false)
	}
	if typoErr := detectICloudEmailDomainTypo(email); typoErr != nil {
		return typoErr
	}
	if strings.TrimSpace(appPassword) == "" {
		return errCode("imap_app_password_missing", "请输入 App 专用密码", false)
	}
	if looksLikeHideMyEmailAddress(email) {
		return errCode(
			"imap_email_invalid",
			"取码登录请填写「Apple ID / 主 iCloud 邮箱」，不要填隐私邮箱（Hide My Email）。隐私邮箱只用于收信地址，不能用来 IMAP 登录。",
			false,
		)
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Password candidates (order matters):
	// 1) reference path: TrimSpace only
	// 2) strip spaces / zero-width / fullwidth hyphen
	// 3) compact 16-char form (no hyphens)
	// 4) lowercase compact (Apple app passwords are lowercase)
	passwords := appPasswordLoginCandidates(appPassword)
	if len(passwords) == 0 {
		return errCode("imap_app_password_missing", "请输入 App 专用密码", false)
	}

	// Auth methods: reference uses LOGIN; CAPABILITY also advertises AUTH=PLAIN.
	methods := []string{"login", "plain"}
	var lastLines []string
	var lastErr error
	for _, password := range passwords {
		for _, method := range methods {
			conn, reader, greErr := dialICloudIMAPReady(ctx)
			if greErr != nil {
				return greErr
			}
			lines, authErr := authenticateICloudIMAP(conn, reader, "A001", email, password, method)
			if authErr != nil {
				_ = conn.Close()
				lastErr = authErr
				continue
			}
			lastLines = lines
			if !imapTaggedOK(lines, "A001") {
				_ = conn.Close()
				continue
			}
			// Login OK → SELECT INBOX (same as reference).
			_ = conn.SetDeadline(time.Now().Add(25 * time.Second))
			selectLines, selErr := imapCommand(conn, reader, "A002", "SELECT INBOX")
			if selErr != nil {
				_ = conn.Close()
				return errCode("imap_select_failed", "打开 iCloud 收件箱失败："+selErr.Error(), true)
			}
			if !imapTaggedOK(selectLines, "A002") {
				_ = conn.Close()
				return errCode("imap_select_failed", "打开 iCloud 收件箱失败："+imapResponseSummary(selectLines), true)
			}
			_, _ = imapCommand(conn, reader, "A003", "LOGOUT")
			_ = conn.Close()
			return nil
		}
	}
	if lastErr != nil && len(lastLines) == 0 {
		return errCode("imap_login_failed", "iCloud IMAP 登录请求失败："+lastErr.Error(), true)
	}
	return errCode("imap_login_failed", imapAuthFailedMessage(email, imapResponseSummary(lastLines)), false)
}

func dialICloudIMAPReady(ctx context.Context) (net.Conn, *bufio.Reader, error) {
	conn, err := dialICloudIMAPTLS(ctx, defaultICloudIMAPHost, defaultICloudIMAPPort)
	if err != nil {
		return nil, nil, errCode("imap_connect_failed", "连接 iCloud IMAP 失败："+err.Error(), true)
	}
	_ = conn.SetDeadline(time.Now().Add(25 * time.Second))
	reader := bufio.NewReader(conn)
	greeting, greErr := reader.ReadString('\n')
	if greErr != nil {
		_ = conn.Close()
		return nil, nil, errCode("imap_greeting_failed", "读取 iCloud IMAP 欢迎信息失败："+greErr.Error(), true)
	}
	if !strings.Contains(strings.ToUpper(greeting), "OK") {
		_ = conn.Close()
		return nil, nil, errCode("imap_greeting_failed", "iCloud IMAP 未就绪："+imapResponseSummary([]string{greeting}), true)
	}
	return conn, reader, nil
}

func authenticateICloudIMAP(conn net.Conn, reader *bufio.Reader, tag, email, password, method string) ([]string, error) {
	method = strings.ToLower(strings.TrimSpace(method))
	switch method {
	case "plain":
		// RFC 4616: base64("\0username\0password") — CAPABILITY lists AUTH=PLAIN.
		payload := base64.StdEncoding.EncodeToString([]byte("\x00" + email + "\x00" + password))
		return imapCommand(conn, reader, tag, "AUTHENTICATE PLAIN "+payload)
	default:
		// Reference (gptGrok2api-1.0.4): LOGIN "user" "pass"
		return imapCommand(conn, reader, tag, "LOGIN "+imapQuote(email)+" "+imapQuote(password))
	}
}
