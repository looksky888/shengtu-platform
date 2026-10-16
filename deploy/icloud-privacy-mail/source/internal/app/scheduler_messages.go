package app

import (
	"context"
	"fmt"
	"strings"
	"time"
)

func waitMailboxSchedulerRoundInterval(ctx context.Context, interval time.Duration) error {
	if interval <= 0 {
		return nil
	}
	timer := time.NewTimer(interval)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func schedulerBatchStartedMessage(batch int) string {
	return fmt.Sprintf("开始第 %d 次定时创建：勾选账号同时创建，失败账号本轮临时跳过，直到全部临时失败后等待下次", batch)
}

func schedulerMissingLoginStateMessage(channel mailboxCreateChannel) string {
	switch normalizeMailboxCreateChannel(channel) {
	case mailboxCreateChannelAppleAccount:
		return "未保存新接口登录态"
	case mailboxCreateChannelICloudWeb:
		return "未保存旧接口登录态"
	default:
		return "未保存新接口或旧接口登录态"
	}
}

func schedulerBatchFailedMessage(index int, message string) string {
	return fmt.Sprintf("第 %d 轮创建失败：%s", index, message)
}

func schedulerMailboxCreatedMessage(index int, account string, channel mailboxCreateChannel, email string) string {
	account = strings.TrimSpace(account)
	if account == "" {
		account = "未知账号"
	}
	return fmt.Sprintf("第 %d 轮%s使用%s创建成功：%s", index, account, mailboxCreateChannelLabel(channel), email)
}

func schedulerAccountFailedMessage(index int, account string, channel mailboxCreateChannel, message string) string {
	if index <= 0 {
		return fmt.Sprintf("账号创建失败：%s，本次定时创建临时跳过该账号，下一次定时创建再试", message)
	}
	account = strings.TrimSpace(account)
	if account == "" {
		account = "未知账号"
	}
	return fmt.Sprintf("第 %d 轮%s使用%s创建失败：%s；该账号本轮已无可用接口，本次定时创建临时跳过该账号，下一次定时创建再试", index, account, mailboxCreateChannelLabel(channel), message)
}

func schedulerChannelFailedMessage(index int, account string, channel mailboxCreateChannel, message string, nextChannel mailboxCreateChannel) string {
	account = strings.TrimSpace(account)
	if account == "" {
		account = "未知账号"
	}
	return fmt.Sprintf("第 %d 轮%s使用%s创建失败：%s；本轮切换%s继续尝试", index, account, mailboxCreateChannelLabel(channel), message, mailboxCreateChannelLabel(nextChannel))
}

func schedulerChannelRetryMessage(index int, account string, channel mailboxCreateChannel, message string) string {
	account = strings.TrimSpace(account)
	if account == "" {
		account = "未知账号"
	}
	return fmt.Sprintf("第 %d 轮%s使用%s创建失败：%s；下轮重试%s", index, account, mailboxCreateChannelLabel(channel), message, mailboxCreateChannelLabel(channel))
}

func mailboxCreateChannelFromRemote(remote ICloudRemoteMailbox) mailboxCreateChannel {
	origin := strings.TrimSpace(remote.Origin)
	if channel := normalizeMailboxCreateChannel(mailboxCreateChannel(strings.ToLower(origin))); channel != mailboxCreateChannelAuto {
		return channel
	}
	if strings.EqualFold(origin, "APPLE_ACCOUNT") {
		return mailboxCreateChannelAppleAccount
	}
	if strings.TrimSpace(remote.Email) != "" {
		return mailboxCreateChannelICloudWeb
	}
	return mailboxCreateChannelAuto
}

func (s *Server) schedulerMailboxAccountLabel(accountID string) string {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return ""
	}
	if account, ok := s.store.FindAccountByID(accountID); ok {
		return firstNonEmpty(strings.TrimSpace(account.AppleID), strings.TrimSpace(account.Label), accountID)
	}
	return accountID
}

func schedulerFailureAccountLabel(failure createMailboxFailure) string {
	return firstNonEmpty(strings.TrimSpace(failure.AppleID), strings.TrimSpace(failure.AccountID))
}
