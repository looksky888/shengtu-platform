from __future__ import annotations

import base64
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import pytest

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.deletions import ProviderAccountDeletionService, ProviderDeleteError
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository
from runtime.provider_accounts.models import ProviderAccount, ProviderName
from runtime.provider_accounts.provider_import import ProviderImportBatch, parse_provider_import
from runtime.provider_accounts.repository import ProviderAccountRepository


@dataclass(frozen=True)
class LinkedTrio:
    web_id: str
    build_id: str
    console_id: str
    web_batch: ProviderImportBatch


def _seed_trio(db_path: Path) -> LinkedTrio:
    cipher = ProviderCredentialCipher.from_base64(base64.b64encode(b"d" * 32).decode("ascii"))
    repository = ProviderAccountManagementRepository(db_path)
    web_batch = parse_provider_import("web", "delete-web-sso")
    build_batch = parse_provider_import(
        "build", '{"access_token":"delete-build-access","refresh_token":"delete-build-refresh","user_id":"delete-user"}',
    )
    console_batch = parse_provider_import("console", "delete-console-sso")
    web_id = repository.import_accounts(web_batch.accounts, cipher, lambda *_: None).account_ids[0]
    build_id = repository.import_accounts(build_batch.accounts, cipher, lambda *_: None).account_ids[0]
    console_id = repository.import_accounts(console_batch.accounts, cipher, lambda *_: None).account_ids[0]
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executemany(
            """INSERT INTO provider_account_links (
                id, left_account_id, right_account_id, kind, source_fingerprint,
                metadata_json, record_origin, projected_at
            ) VALUES (?,?,?,?,?,'{}','managed','2026-08-12T00:00:00+00:00')""",
            [
                ("delete-web-build", web_id, build_id, "web_build", "delete-link-build"),
                ("delete-web-console", web_id, console_id, "web_console", "delete-link-console"),
            ],
        )
    return LinkedTrio(web_id, build_id, console_id, web_batch)


def test_preview_resolves_linked_trio_without_mutation(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    trio = _seed_trio(db_path)

    preview = ProviderAccountDeletionService(db_path).preview(
        "web", [trio.web_id], ["build", "console"],
    )

    assert preview["root_ids"] == [trio.web_id]
    assert {item["id"] for item in preview["linked_accounts"]} == {trio.build_id, trio.console_id}
    assert preview["by_provider"] == {"build": 1, "console": 1, "web": 1}
    assert preview["total"] == 3
    assert len(preview["preview_token"]) == 64
    assert ProviderAccountRepository(db_path).count_accounts() == 3


def test_build_delete_can_remove_console_without_intermediate_web(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    trio = _seed_trio(db_path)
    service = ProviderAccountDeletionService(db_path)
    preview = service.preview("build", [trio.build_id], ["console"])

    result = service.delete("build", [trio.build_id], ["console"], preview["preview_token"])

    assert result["deleted"] == 2
    assert result["roots_deleted"] == result["linked_deleted"] == 1
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM provider_accounts WHERE id=?", (trio.web_id,)).fetchone() == (1,)
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_accounts WHERE id IN (?,?)", (trio.build_id, trio.console_id),
        ).fetchone() == (0,)
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_account_credentials WHERE account_id IN (?,?)",
            (trio.build_id, trio.console_id),
        ).fetchone() == (0,)


def test_delete_rejects_stale_preview_without_deleting_accounts(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    trio = _seed_trio(db_path)
    service = ProviderAccountDeletionService(db_path)
    preview = service.preview("web", [trio.web_id], ["console"])
    with sqlite3.connect(db_path) as conn:
        conn.execute("DELETE FROM provider_account_links WHERE kind='web_console'")

    with pytest.raises(ProviderDeleteError, match="provider_delete_preview_stale") as caught:
        service.delete("web", [trio.web_id], ["console"], preview["preview_token"])

    assert caught.value.status_code == 409
    assert ProviderAccountRepository(db_path).count_accounts() == 3


def test_tombstone_blocks_projection_until_explicit_reimport(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    trio = _seed_trio(db_path)
    service = ProviderAccountDeletionService(db_path)
    preview = service.preview("web", [trio.web_id], [])
    service.delete("web", [trio.web_id], [], preview["preview_token"])
    source = trio.web_batch.accounts[0]

    ProviderAccountRepository(db_path).replace_projection([
        ProviderAccount(
            id=source.id,
            provider=ProviderName.WEB,
            source_fingerprint=source.source_fingerprint,
            projection_source="legacy_web_json",
            status="active",
        ),
    ])
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM provider_accounts WHERE id=?", (trio.web_id,)).fetchone() == (0,)
        assert conn.execute("SELECT COUNT(*) FROM provider_account_tombstones WHERE id=?", (trio.web_id,)).fetchone() == (1,)

    cipher = ProviderCredentialCipher.from_base64(base64.b64encode(b"d" * 32).decode("ascii"))
    ProviderAccountManagementRepository(db_path).import_accounts(trio.web_batch.accounts, cipher, lambda *_: None)
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM provider_accounts WHERE id=?", (trio.web_id,)).fetchone() == (1,)
        assert conn.execute("SELECT COUNT(*) FROM provider_account_tombstones WHERE id=?", (trio.web_id,)).fetchone() == (0,)


def test_delete_scope_is_exact_and_provider_bound(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    trio = _seed_trio(db_path)
    service = ProviderAccountDeletionService(db_path)

    with pytest.raises(ProviderDeleteError, match="provider_delete_provider_mismatch"):
        service.preview("console", [trio.web_id], [])
    with pytest.raises(ProviderDeleteError, match="provider_delete_account_not_found"):
        service.preview("web", [trio.web_id, "missing"], [])
    with pytest.raises(ProviderDeleteError, match="provider_delete_linked_provider_self"):
        service.preview("web", [trio.web_id], ["web"])
