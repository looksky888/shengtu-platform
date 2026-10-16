from __future__ import annotations

import sqlite3

from runtime.provider_accounts.runtime_build_store import ProviderBuildOAuthStore
from runtime.provider_accounts.runtime_capacity import ProviderCapacityRegistry
from runtime.provider_accounts.runtime_test_support import create_runtime_fixture


def test_build_store_selects_text_account_and_releases_capacity(tmp_path, monkeypatch) -> None:
    _db_path, account_ids, repository = create_runtime_fixture(
        tmp_path,
        monkeypatch,
        "build",
        '{"access_token":"access-secret","refresh_token":"refresh-secret","email":"build@example.test"}',
    )
    store = ProviderBuildOAuthStore(repository, ProviderCapacityRegistry())

    assert "grok-4.5" in store.available_models()
    account = store.select_next_account(required_model="grok-4.5")
    assert account is not None and account["access_token"] == "access-secret"
    assert store.select_next_account(required_model="grok-4.5") is None
    store.record_result(account_ids[0], True)
    assert store.select_next_account(required_model="grok-4.5") is not None


def test_build_store_selects_video_only_account_by_capability(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = create_runtime_fixture(
        tmp_path,
        monkeypatch,
        "build",
        '{"provider":"grok_build","accounts":['
        '{"access_token":"text-access","refresh_token":"text-refresh","email":"text@example.test","models":["grok-4.5"]},'
        '{"access_token":"video-access","refresh_token":"video-refresh","email":"video@example.test","models":["grok-imagine-video-1.5"]}'
        "]}",
    )
    text_id, video_id = account_ids
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE provider_accounts SET capabilities_json='[\"text\"]' WHERE id=?", (text_id,))
        conn.execute("UPDATE provider_accounts SET capabilities_json='[\"video\"]' WHERE id=?", (video_id,))
        conn.commit()
    store = ProviderBuildOAuthStore(repository, ProviderCapacityRegistry())

    assert store.has_selectable_accounts(required_capability="video") is True
    account = store.select_next_account(required_model="grok-imagine-video-1.5")
    assert account is not None
    assert account["access_token"] == "video-access"
    store.record_result(video_id, False, "HTTP 403: forbidden")
    assert repository.get_candidate(video_id, "build") is not None
    assert store.select_next_account(required_capability="video") is not None
    store.set_status([video_id], "invalid")
    assert repository.get_candidate(video_id, "build") is None
