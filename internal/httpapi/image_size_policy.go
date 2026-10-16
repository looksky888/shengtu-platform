package httpapi

import (
	"errors"

	"chatgpt2api/internal/protocol"
)

const accountPoolPaidImageSizeDisabledMessage = "本地号池已禁用需要 Paid 账号的大尺寸，请使用 1024×1024、1536×1024 等标准尺寸"

func validateImageSizeForProvider(provider, size string) error {
	if provider == imageProviderAccountPool && protocol.RequiresPaidImageSize(size) {
		return errors.New(accountPoolPaidImageSizeDisabledMessage)
	}
	return nil
}
