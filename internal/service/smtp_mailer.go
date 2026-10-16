package service

import (
	"context"
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

const smtpOperationTimeout = 15 * time.Second

func sendSMTPMail(ctx context.Context, setting EmailSMTPConfig, recipient, subject, body string) error {
	if _, err := normalizeAccountEmail(recipient); err != nil {
		return err
	}
	if strings.ContainsAny(subject, "\r\n") || strings.ContainsAny(setting.FromName, "\r\n") {
		return fmt.Errorf("邮件头字段无效")
	}
	deadline := time.Now().Add(smtpOperationTimeout)
	if value, ok := ctx.Deadline(); ok && value.Before(deadline) {
		deadline = value
	}
	address := net.JoinHostPort(setting.Host, strconv.Itoa(setting.Port))
	dialer := &net.Dialer{Timeout: smtpOperationTimeout}
	connection, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	if err := connection.SetDeadline(deadline); err != nil {
		_ = connection.Close()
		return err
	}

	tlsConfig := &tls.Config{ServerName: setting.Host, MinVersion: tls.VersionTLS12}
	if setting.Encryption == "tls" {
		tlsConnection := tls.Client(connection, tlsConfig)
		if err := tlsConnection.HandshakeContext(ctx); err != nil {
			_ = connection.Close()
			return err
		}
		connection = tlsConnection
	}
	client, err := smtp.NewClient(connection, setting.Host)
	if err != nil {
		_ = connection.Close()
		return err
	}
	defer client.Close()
	if setting.Encryption == "starttls" {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("SMTP 服务器不支持 STARTTLS")
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			return err
		}
	}
	if setting.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", setting.Username, setting.Password, setting.Host)); err != nil {
			return err
		}
	}
	if err := client.Mail(setting.FromEmail); err != nil {
		return err
	}
	if err := client.Rcpt(recipient); err != nil {
		return err
	}
	wc, err := client.Data()
	if err != nil {
		return err
	}
	from := mail.Address{Name: setting.FromName, Address: setting.FromEmail}
	message := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", from.String(), recipient, mime.QEncoding.Encode("UTF-8", subject), body)
	if _, err := wc.Write([]byte(message)); err != nil {
		_ = wc.Close()
		return err
	}
	if err := wc.Close(); err != nil {
		return err
	}
	return client.Quit()
}
