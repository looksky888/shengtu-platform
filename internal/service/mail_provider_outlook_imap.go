package service

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// imapMessages reads recent INBOX messages via IMAP XOAUTH2 (Outlook/Hotmail).
func (p *registerOutlookTokenProvider) imapMessages(mailbox map[string]any, accessToken string) ([]map[string]any, error) {
	address := util.Clean(mailbox["address"])
	if address == "" {
		return nil, fmt.Errorf("OutlookToken IMAP mailbox 缺少 address")
	}
	host := firstNonEmpty(util.Clean(p.entry["imap_host"]), outlookDefaultIMAPHost)
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: p.conf.RequestTimeout}, "tcp", host+":993", &tls.Config{
		MinVersion: tls.VersionTLS12,
		ServerName: host,
	})
	if err != nil {
		return nil, fmt.Errorf("OutlookToken IMAP 连接失败: %w", err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(maxDuration(p.conf.RequestTimeout, 30*time.Second)))

	reader := bufio.NewReader(conn)
	if _, err := readIMAPLine(reader); err != nil {
		return nil, fmt.Errorf("OutlookToken IMAP greeting: %w", err)
	}

	auth := base64.StdEncoding.EncodeToString([]byte("user=" + address + "\x01auth=Bearer " + accessToken + "\x01\x01"))
	tag := 1
	if err := writeIMAP(conn, tag, "AUTHENTICATE XOAUTH2 "+auth); err != nil {
		return nil, err
	}
	if err := expectIMAPOK(reader, tag); err != nil {
		return nil, fmt.Errorf("OutlookToken IMAP AUTHENTICATE: %w", err)
	}

	tag++
	if err := writeIMAP(conn, tag, "SELECT INBOX"); err != nil {
		return nil, err
	}
	if err := expectIMAPOK(reader, tag); err != nil {
		return nil, fmt.Errorf("OutlookToken IMAP SELECT: %w", err)
	}

	tag++
	if err := writeIMAP(conn, tag, "UID SEARCH ALL"); err != nil {
		return nil, err
	}
	uids, err := readIMAPSearchUIDs(reader, tag)
	if err != nil {
		return nil, fmt.Errorf("OutlookToken IMAP SEARCH: %w", err)
	}
	if len(uids) == 0 {
		return nil, nil
	}
	limit := p.messageLimit
	if limit < 1 {
		limit = 10
	}
	if len(uids) > limit {
		uids = uids[len(uids)-limit:]
	}

	// Newest first
	out := make([]map[string]any, 0, len(uids))
	for i := len(uids) - 1; i >= 0; i-- {
		uid := uids[i]
		tag++
		if err := writeIMAP(conn, tag, fmt.Sprintf("UID FETCH %d (RFC822)", uid)); err != nil {
			return nil, err
		}
		raw, fetchErr := readIMAPFetchRFC822(reader, tag)
		if fetchErr != nil || len(raw) == 0 {
			continue
		}
		if msg, parseErr := parseIMAPRFC822(mailbox, raw); parseErr == nil {
			out = append(out, msg)
		}
	}

	tag++
	_ = writeIMAP(conn, tag, "LOGOUT")
	return out, nil
}

func writeIMAP(conn net.Conn, tag int, command string) error {
	_, err := fmt.Fprintf(conn, "A%04d %s\r\n", tag, command)
	return err
}

func readIMAPLine(reader *bufio.Reader) (string, error) {
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func expectIMAPOK(reader *bufio.Reader, tag int) error {
	want := fmt.Sprintf("A%04d OK", tag)
	for {
		line, err := readIMAPLine(reader)
		if err != nil {
			return err
		}
		if strings.HasPrefix(line, want) {
			return nil
		}
		if strings.HasPrefix(line, fmt.Sprintf("A%04d NO", tag)) || strings.HasPrefix(line, fmt.Sprintf("A%04d BAD", tag)) {
			return fmt.Errorf("%s", line)
		}
		// untagged continues
	}
}

func readIMAPSearchUIDs(reader *bufio.Reader, tag int) ([]int, error) {
	want := fmt.Sprintf("A%04d OK", tag)
	var uids []int
	for {
		line, err := readIMAPLine(reader)
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(line, "* SEARCH") {
			parts := strings.Fields(line)
			for _, part := range parts[2:] {
				n, convErr := strconv.Atoi(part)
				if convErr == nil {
					uids = append(uids, n)
				}
			}
			continue
		}
		if strings.HasPrefix(line, want) {
			return uids, nil
		}
		if strings.HasPrefix(line, fmt.Sprintf("A%04d NO", tag)) || strings.HasPrefix(line, fmt.Sprintf("A%04d BAD", tag)) {
			return nil, fmt.Errorf("%s", line)
		}
	}
}

func readIMAPFetchRFC822(reader *bufio.Reader, tag int) ([]byte, error) {
	want := fmt.Sprintf("A%04d OK", tag)
	var raw []byte
	for {
		line, err := readIMAPLine(reader)
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(line, want) {
			return raw, nil
		}
		if strings.HasPrefix(line, fmt.Sprintf("A%04d NO", tag)) || strings.HasPrefix(line, fmt.Sprintf("A%04d BAD", tag)) {
			return nil, fmt.Errorf("%s", line)
		}
		// * <n> FETCH (... {size}
		if idx := strings.Index(line, "{"); idx >= 0 && strings.HasSuffix(line, "}") {
			sizeStr := line[idx+1 : len(line)-1]
			size, convErr := strconv.Atoi(sizeStr)
			if convErr != nil || size <= 0 || size > 4<<20 {
				continue
			}
			buf := make([]byte, size)
			if _, err := io.ReadFull(reader, buf); err != nil {
				return nil, err
			}
			raw = buf
			// trailing CRLF after literal
			_, _ = reader.ReadString('\n')
		}
	}
}

func parseIMAPRFC822(mailbox map[string]any, raw []byte) (map[string]any, error) {
	msg, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		return nil, err
	}
	subject := decodeMIMEHeader(msg.Header.Get("Subject"))
	from := decodeMIMEHeader(msg.Header.Get("From"))
	messageID := msg.Header.Get("Message-Id")
	if messageID == "" {
		messageID = msg.Header.Get("Message-ID")
	}
	receivedAt := msg.Header.Get("Date")
	plain, html := extractMailBodies(msg)
	return map[string]any{
		"provider":     "outlook_token",
		"mailbox":      util.Clean(mailbox["address"]),
		"message_id":   messageID,
		"subject":      subject,
		"sender":       from,
		"text_content": plain,
		"html_content": html,
		"received_at":  receivedAt,
		"raw":          nil,
	}, nil
}

func decodeMIMEHeader(value string) string {
	if value == "" {
		return ""
	}
	dec := new(mime.WordDecoder)
	out, err := dec.DecodeHeader(value)
	if err != nil {
		return value
	}
	return out
}

func extractMailBodies(msg *mail.Message) (plain, html string) {
	mediaType, params, err := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	if err != nil {
		data, _ := io.ReadAll(io.LimitReader(msg.Body, 1<<20))
		return string(data), ""
	}
	if strings.HasPrefix(mediaType, "multipart/") {
		mr := multipart.NewReader(msg.Body, params["boundary"])
		var plains, htmls []string
		for {
			part, partErr := mr.NextPart()
			if partErr != nil {
				break
			}
			ct := part.Header.Get("Content-Type")
			body, _ := io.ReadAll(io.LimitReader(part, 1<<20))
			text := string(body)
			if strings.Contains(strings.ToLower(ct), "text/html") {
				htmls = append(htmls, text)
			} else if strings.Contains(strings.ToLower(ct), "text/plain") || strings.HasPrefix(strings.ToLower(ct), "text/") {
				plains = append(plains, text)
			}
		}
		return strings.Join(plains, "\n"), strings.Join(htmls, "\n")
	}
	data, _ := io.ReadAll(io.LimitReader(msg.Body, 1<<20))
	if strings.Contains(mediaType, "html") {
		return "", string(data)
	}
	return string(data), ""
}

func maxDuration(a, b time.Duration) time.Duration {
	if a > b {
		return a
	}
	return b
}
