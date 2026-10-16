"""SQLite schema and additive migrations for unified Provider accounts."""

from __future__ import annotations

import sqlite3


def initialize_provider_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS provider_accounts (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL CHECK(provider IN ('build','web','console')),
            source_fingerprint TEXT NOT NULL,
            projection_source TEXT NOT NULL,
            record_origin TEXT NOT NULL DEFAULT 'projected' CHECK(record_origin IN ('projected','managed')),
            status TEXT NOT NULL CHECK(status IN ('active','disabled','error','unknown')),
            source_type TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            email_masked TEXT NOT NULL DEFAULT '',
            credential_kind TEXT NOT NULL DEFAULT '',
            has_credential INTEGER NOT NULL DEFAULT 0 CHECK(has_credential IN (0,1)),
            max_concurrent INTEGER NOT NULL DEFAULT 1 CHECK(max_concurrent BETWEEN 1 AND 256),
            capabilities_json TEXT NOT NULL DEFAULT '[]',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            source_created_at TEXT NOT NULL DEFAULT '',
            source_updated_at TEXT NOT NULL DEFAULT '',
            projected_at TEXT NOT NULL,
            UNIQUE(provider, source_fingerprint)
        );
        CREATE INDEX IF NOT EXISTS idx_provider_accounts_list
            ON provider_accounts(provider, status, source_updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_provider_accounts_source
            ON provider_accounts(projection_source);

        CREATE TABLE IF NOT EXISTS provider_account_links (
            id TEXT PRIMARY KEY,
            left_account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
            right_account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK(kind IN ('web_build','web_console')),
            source_fingerprint TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            record_origin TEXT NOT NULL DEFAULT 'projected' CHECK(record_origin IN ('projected','managed')),
            projected_at TEXT NOT NULL,
            UNIQUE(kind, left_account_id, right_account_id),
            UNIQUE(kind, source_fingerprint),
            CHECK(left_account_id <> right_account_id)
        );

        CREATE TABLE IF NOT EXISTS provider_account_quotas (
            account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
            capability TEXT NOT NULL,
            remaining INTEGER,
            limit_value INTEGER,
            reset_at TEXT NOT NULL DEFAULT '',
            checked_at TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'unknown',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            record_origin TEXT NOT NULL DEFAULT 'projected' CHECK(record_origin IN ('projected','managed')),
            projected_at TEXT NOT NULL,
            PRIMARY KEY(account_id, capability),
            CHECK(remaining IS NULL OR remaining >= 0),
            CHECK(limit_value IS NULL OR limit_value >= 0)
        );

        CREATE TABLE IF NOT EXISTS provider_projection_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL CHECK(status IN ('success','failed')),
            account_count INTEGER NOT NULL DEFAULT 0,
            link_count INTEGER NOT NULL DEFAULT 0,
            quota_count INTEGER NOT NULL DEFAULT 0,
            source_counts_json TEXT NOT NULL DEFAULT '{}',
            warnings_json TEXT NOT NULL DEFAULT '[]',
            error_code TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL,
            finished_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_account_credentials (
            account_id TEXT PRIMARY KEY REFERENCES provider_accounts(id) ON DELETE CASCADE,
            auth_type TEXT NOT NULL CHECK(auth_type IN ('sso','oauth')),
            encrypted_primary TEXT NOT NULL,
            encrypted_refresh TEXT NOT NULL DEFAULT '',
            encrypted_id_token TEXT NOT NULL DEFAULT '',
            encrypted_clearance TEXT NOT NULL DEFAULT '',
            key_version INTEGER NOT NULL DEFAULT 1 CHECK(key_version > 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK(encrypted_primary <> '')
        );

        CREATE TABLE IF NOT EXISTS provider_account_egress (
            account_id TEXT PRIMARY KEY REFERENCES provider_accounts(id) ON DELETE CASCADE,
            mode TEXT NOT NULL CHECK(mode IN ('inherit','direct','proxy')),
            egress_identity TEXT NOT NULL DEFAULT '',
            encrypted_proxy TEXT NOT NULL DEFAULT '',
            key_version INTEGER NOT NULL DEFAULT 1 CHECK(key_version > 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK((mode='proxy' AND encrypted_proxy<>'') OR (mode<>'proxy' AND encrypted_proxy=''))
        );

        CREATE TABLE IF NOT EXISTS provider_account_tombstones (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL CHECK(provider IN ('build','web','console')),
            source_fingerprint TEXT NOT NULL,
            deleted_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_authority_state (
            singleton INTEGER PRIMARY KEY CHECK(singleton=1),
            mode TEXT NOT NULL CHECK(mode='authoritative'),
            migrated_at TEXT NOT NULL,
            report_json TEXT NOT NULL DEFAULT '{}'
        );
        """
    )
    _ensure_column(conn, "provider_accounts", "record_origin", "TEXT NOT NULL DEFAULT 'projected' CHECK(record_origin IN ('projected','managed'))")
    _ensure_column(conn, "provider_accounts", "max_concurrent", "INTEGER NOT NULL DEFAULT 1 CHECK(max_concurrent BETWEEN 1 AND 256)")
    _ensure_column(conn, "provider_account_links", "record_origin", "TEXT NOT NULL DEFAULT 'projected' CHECK(record_origin IN ('projected','managed'))")
    _ensure_column(conn, "provider_account_quotas", "record_origin", "TEXT NOT NULL DEFAULT 'projected' CHECK(record_origin IN ('projected','managed'))")
    _ensure_column(conn, "provider_account_credentials", "encrypted_clearance", "TEXT NOT NULL DEFAULT ''")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_web_console_link_web "
        "ON provider_account_links(left_account_id) WHERE kind='web_console'"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_web_console_link_console "
        "ON provider_account_links(right_account_id) WHERE kind='web_console'"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_web_build_link_web "
        "ON provider_account_links(left_account_id) WHERE kind='web_build'"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_web_build_link_build "
        "ON provider_account_links(right_account_id) WHERE kind='web_build'"
    )
    conn.commit()


def _ensure_column(conn: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if name not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
