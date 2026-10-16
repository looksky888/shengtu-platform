from __future__ import annotations

from runtime.provider_accounts.runtime_build_store import ProviderBuildOAuthStore
from runtime.provider_accounts.runtime_capacity import ProviderCapacityRegistry
from runtime.provider_accounts.test_runtime_routing import _runtime


def test_build_store_failure_releases_video_capacity(tmp_path, monkeypatch) -> None:
    _db_path, account_ids, repository = _runtime(
        tmp_path,
        monkeypatch,
        "build",
        '{"access_token":"video-access","refresh_token":"video-refresh",'
        '"email":"video@example.test","models":["grok-imagine-video-1.5"]}',
    )
    capacity = ProviderCapacityRegistry()
    store = ProviderBuildOAuthStore(repository, capacity)

    account = store.select_next_account(required_capability="video")
    assert account is not None
    assert capacity.snapshot(account_ids[0], 1).inflight == 1

    store.record_result(account_ids[0], False, "refresh failed")

    assert capacity.snapshot(account_ids[0], 1).inflight == 0
    assert store.select_next_account(required_capability="video") is not None
