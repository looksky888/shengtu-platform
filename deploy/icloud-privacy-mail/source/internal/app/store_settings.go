package app

import (
	"strings"
	"time"
)

func createSettingsForOwnerLocked(state State, ownerID string) CreateSettings {
	ownerID = strings.TrimSpace(ownerID)
	for _, settings := range state.CreateSettings {
		if sameOwnerID(ownerID, settings.OwnerID) {
			return normalizeCreateSettings(ownerID, settings)
		}
	}
	return defaultCreateSettings(ownerID)
}

func defaultCreateSettings(ownerID string) CreateSettings {
	return CreateSettings{
		OwnerID:                       strings.TrimSpace(ownerID),
		CreateChannel:                 string(mailboxCreateChannelAuto),
		SchedulerCreateChannel:        string(mailboxCreateChannelAuto),
		AppleAccountTwoFactorMethod:   appleTwoFactorMethodTrustedDevice,
		ICloudWebTwoFactorMethod:      appleTwoFactorMethodTrustedDevice,
		SchedulerIntervalMinutes:      int(defaultMailboxSchedulerInterval.Round(time.Minute).Minutes()),
		SchedulerRoundIntervalSeconds: int(defaultMailboxSchedulerRoundInterval.Round(time.Second).Seconds()),
		MailboxPageSize:               10,
	}
}

func normalizeCreateSettings(ownerID string, settings CreateSettings) CreateSettings {
	defaults := defaultCreateSettings(ownerID)
	out := settings
	out.OwnerID = strings.TrimSpace(ownerID)
	out.Label = strings.TrimSpace(settings.Label)
	out.Note = strings.TrimSpace(settings.Note)
	out.AccountIDs = normalizeAccountIDSelection("", settings.AccountIDs)
	out.CreateChannel = string(normalizeMailboxCreateChannel(mailboxCreateChannel(strings.ToLower(strings.TrimSpace(settings.CreateChannel)))))
	out.SchedulerCreateChannel = string(normalizeMailboxCreateChannel(mailboxCreateChannel(strings.ToLower(strings.TrimSpace(settings.SchedulerCreateChannel)))))
	out.AppleAccountTwoFactorMethod = normalizeAppleTwoFactorMethod(settings.AppleAccountTwoFactorMethod)
	out.ICloudWebTwoFactorMethod = normalizeAppleTwoFactorMethod(settings.ICloudWebTwoFactorMethod)
	if out.SchedulerIntervalMinutes < 1 {
		out.SchedulerIntervalMinutes = defaults.SchedulerIntervalMinutes
	}
	if out.SchedulerIntervalMinutes > 1440 {
		out.SchedulerIntervalMinutes = 1440
	}
	if out.SchedulerRoundIntervalSeconds < 1 {
		out.SchedulerRoundIntervalSeconds = defaults.SchedulerRoundIntervalSeconds
	}
	if out.SchedulerRoundIntervalSeconds > 600 {
		out.SchedulerRoundIntervalSeconds = 600
	}
	if out.MailboxPageSize < 1 {
		out.MailboxPageSize = defaults.MailboxPageSize
	}
	if out.MailboxPageSize > 500 {
		out.MailboxPageSize = 500
	}
	return out
}
