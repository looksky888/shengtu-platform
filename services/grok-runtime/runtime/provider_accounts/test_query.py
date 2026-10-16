from __future__ import annotations

from pathlib import Path

from runtime.provider_accounts.models import ProviderAccount, ProviderAccountLink, ProviderAccountQuota, ProviderName
from runtime.provider_accounts.query import ProviderAccountQuery
from runtime.provider_accounts.repository import ProviderAccountRepository


def test_links_are_visible_from_both_accounts_on_same_page(tmp_path: Path) -> None:
    repository = ProviderAccountRepository(tmp_path / "accounts.db")
    web = ProviderAccount("web-1", ProviderName.WEB, "web-fp", "test")
    build = ProviderAccount("build-1", ProviderName.BUILD, "build-fp", "test")
    link = ProviderAccountLink("link-1", web.id, build.id, "web_build", "link-fp")
    projection = repository.replace_projection([web, build], [link])

    response = ProviderAccountQuery(repository).list_view(
        page=1,
        page_size=20,
        provider="all",
        status="all",
        keyword="",
        projection={**projection, "sources": {}, "consistency": {}},
    )

    by_id = {item["id"]: item for item in response["items"]}
    assert by_id[web.id]["links"][0]["account_id"] == build.id
    assert by_id[build.id]["links"][0]["account_id"] == web.id


def test_summary_reports_slots_quota_and_detection_failures(tmp_path: Path) -> None:
    repository = ProviderAccountRepository(tmp_path / "accounts.db")
    web = ProviderAccount("web-1", ProviderName.WEB, "web-fp", "test")
    projection = repository.replace_projection([web], quotas=[ProviderAccountQuota(account_id=web.id, capability="video", remaining=0, status="exhausted")])
    repository.initialize()
    import sqlite3, json
    with sqlite3.connect(repository.path) as conn:
        conn.execute("UPDATE provider_accounts SET status='active', max_concurrent=3, has_credential=1, metadata_json=? WHERE id=?", (json.dumps({"detection": {"outcome": "invalid", "code": "dpop_token_rejected"}}), web.id))
        conn.commit()
    response = ProviderAccountQuery(repository).list_view(page=1, page_size=20, provider="all", status="all", keyword="", projection={**projection, "sources": {}, "consistency": {}})
    summary = response["summary"]
    assert summary["theoretical_slots"] == 3
    assert summary["quota_exhausted"] == 1
    assert summary["recent_failure_codes"] == {"dpop_token_rejected": 1}
