package service

import "context"

const passwordResetEmailPurpose = "password_reset"

func (s *RegistrationEmailService) SendPasswordResetCode(
	ctx context.Context,
	email, clientIP, deviceID string,
) (EmailCodeDelivery, error) {
	return s.sendEmailCode(
		ctx,
		email,
		clientIP,
		deviceID,
		passwordResetEmailPurpose,
		"生图密码重置验证码",
		"发送密码重置邮件失败",
		passwordResetEmailBody,
	)
}

func (s *RegistrationEmailService) VerifyPasswordResetCode(email, code, deviceID string) (string, error) {
	return s.verifyEmailCode(email, code, deviceID, passwordResetEmailPurpose)
}

func passwordResetEmailBody(code string) string {
	return "你正在重置生图平台账号密码。\n\n验证码：" + code +
		"\n\n验证码 10 分钟内有效。若非本人操作，请忽略本邮件。"
}
