package storage

// SchemaVersion identifies the durable storage contract expected by this
// binary. Increment it when a release requires a one-way schema change so the
// host updater can reject an incompatible image before switching containers.
const (
	SchemaVersion          = 1
	MinSourceSchemaVersion = 1
)
