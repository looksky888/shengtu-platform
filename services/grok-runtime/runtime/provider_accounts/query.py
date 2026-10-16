"""Read-only paginated queries for the provider account projection."""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from typing import Any

from .repository import ProviderAccountRepository
from .sql_placeholders import bound_placeholders

_PROVIDERS = ("build", "web", "console")
_STATUSES = ("active", "disabled", "error", "unknown")


def _like_pattern(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class ProviderAccountQuery:
    def __init__(self, repository: ProviderAccountRepository) -> None:
        self._repository = repository

    def list_view(
        self,
        *,
        page: int,
        page_size: int,
        provider: str,
        status: str,
        keyword: str,
        projection: dict[str, Any],
    ) -> dict[str, Any]:
        page = max(1, int(page))
        page_size = max(1, min(200, int(page_size)))
        provider = str(provider or "all").strip().lower()
        status = str(status or "all").strip().lower()
        if provider != "all" and provider not in _PROVIDERS:
            raise ValueError("invalid_provider")
        if status != "all" and status not in _STATUSES:
            raise ValueError("invalid_status")

        self._repository.initialize()
        with closing(self._repository._connect()) as conn:  # package-private query boundary
            where, params = self._filters(provider, status, keyword)
            total = int(conn.execute(f"SELECT COUNT(*) FROM provider_accounts{where}", params).fetchone()[0])
            rows = conn.execute(
                f"""SELECT provider_accounts.*,
                    COALESCE((SELECT mode FROM provider_account_egress e WHERE e.account_id=provider_accounts.id), 'inherit') AS egress_mode,
                    COALESCE((SELECT egress_identity FROM provider_account_egress e WHERE e.account_id=provider_accounts.id), 'inherit') AS egress_identity,
                    EXISTS(SELECT 1 FROM provider_account_egress e WHERE e.account_id=provider_accounts.id AND e.mode='proxy' AND e.encrypted_proxy<>'') AS egress_configured
                FROM provider_accounts{where}
                ORDER BY CASE WHEN source_updated_at = '' THEN 1 ELSE 0 END,
                    source_updated_at DESC, projected_at DESC, id ASC
                LIMIT ? OFFSET ?""",
                [*params, page_size, (page - 1) * page_size],
            ).fetchall()
            items = [self._item(row) for row in rows]
            links = self._links_for_page(conn, [item["id"] for item in items])
            quotas = self._quotas_for_page(conn, [item["id"] for item in items])
            for item in items:
                item["links"] = links.get(item["id"], [])
                item["quotas"] = quotas.get(item["id"], [])
            summary = self._summary(conn)
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "summary": summary,
            "projection": projection,
        }

    @staticmethod
    def _filters(provider: str, status: str, keyword: str) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if provider != "all":
            clauses.append("provider = ?")
            params.append(provider)
        if status != "all":
            clauses.append("status = ?")
            params.append(status)
        needle = str(keyword or "").strip()
        if needle:
            pattern = _like_pattern(needle)
            clauses.append(
                "(id LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' "
                "OR email_masked LIKE ? ESCAPE '\\' OR source_type LIKE ? ESCAPE '\\')"
            )
            params.extend([pattern] * 4)
        return (" WHERE " + " AND ".join(clauses) if clauses else ""), params

    @staticmethod
    def _item(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "provider": row["provider"],
            "status": row["status"],
            "source_type": row["source_type"],
            "display_name": row["display_name"],
            "email_masked": row["email_masked"],
            "credential_kind": row["credential_kind"],
            "has_credential": bool(row["has_credential"]),
            "max_concurrent": int(row["max_concurrent"]),
            "egress": {
                "mode": row["egress_mode"],
                "identity": row["egress_identity"],
                "configured": bool(row["egress_configured"]),
            },
            "capabilities": json.loads(row["capabilities_json"] or "[]"),
            "metadata": json.loads(row["metadata_json"] or "{}"),
            "source_created_at": row["source_created_at"],
            "source_updated_at": row["source_updated_at"],
            "projected_at": row["projected_at"],
            "links": [],
            "quotas": [],
        }

    @staticmethod
    def _quotas_for_page(conn: sqlite3.Connection, account_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not account_ids:
            return {}
        placeholders = bound_placeholders(len(account_ids))
        rows = conn.execute(
            f"""SELECT account_id, capability, remaining, limit_value, reset_at,
                checked_at, status, metadata_json
                FROM provider_account_quotas WHERE account_id IN ({placeholders})
                ORDER BY account_id, capability""",
            account_ids,
        ).fetchall()
        result: dict[str, list[dict[str, Any]]] = {account_id: [] for account_id in account_ids}
        for row in rows:
            result[str(row["account_id"])].append({
                "capability": row["capability"],
                "remaining": row["remaining"],
                "limit_value": row["limit_value"],
                "reset_at": row["reset_at"],
                "checked_at": row["checked_at"],
                "status": row["status"],
                "metadata": json.loads(row["metadata_json"] or "{}"),
            })
        return result

    @staticmethod
    def _links_for_page(conn: sqlite3.Connection, account_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not account_ids:
            return {}
        placeholders = bound_placeholders(len(account_ids))
        rows = conn.execute(
            f"""SELECT l.id, l.kind, l.left_account_id, l.right_account_id,
                left_account.provider AS left_provider, left_account.status AS left_status,
                right_account.provider AS right_provider, right_account.status AS right_status
            FROM provider_account_links l
            JOIN provider_accounts left_account ON left_account.id = l.left_account_id
            JOIN provider_accounts right_account ON right_account.id = l.right_account_id
            WHERE l.left_account_id IN ({placeholders}) OR l.right_account_id IN ({placeholders})""",
            [*account_ids, *account_ids],
        ).fetchall()
        target_ids = set(account_ids)
        result: dict[str, list[dict[str, Any]]] = {account_id: [] for account_id in account_ids}
        for row in rows:
            if row["left_account_id"] in target_ids:
                result[row["left_account_id"]].append({
                    "id": row["id"], "kind": row["kind"], "account_id": row["right_account_id"],
                    "provider": row["right_provider"], "status": row["right_status"],
                })
            if row["right_account_id"] in target_ids:
                result[row["right_account_id"]].append({
                    "id": row["id"], "kind": row["kind"], "account_id": row["left_account_id"],
                    "provider": row["left_provider"], "status": row["left_status"],
                })
        return result

    @staticmethod
    def _summary(conn: sqlite3.Connection) -> dict[str, Any]:
        by_provider = {key: 0 for key in _PROVIDERS}
        routable_by_provider = {key: 0 for key in _PROVIDERS}
        by_status = {key: 0 for key in _STATUSES}
        with_credentials = 0
        total = 0
        theoretical_slots = 0
        for row in conn.execute(
            "SELECT provider, status, COUNT(*) AS amount, SUM(has_credential) AS credentials, "
            "SUM(CASE WHEN status='active' AND has_credential=1 THEN max_concurrent ELSE 0 END) AS slots "
            "FROM provider_accounts GROUP BY provider, status"
        ):
            amount = int(row["amount"])
            total += amount
            by_provider[row["provider"]] += amount
            by_status[row["status"]] += amount
            with_credentials += int(row["credentials"] or 0)
            theoretical_slots += int(row["slots"] or 0)
        for row in conn.execute(
            """SELECT provider, COUNT(*) AS amount FROM provider_accounts
                WHERE status='active' AND has_credential=1 GROUP BY provider"""
        ):
            routable_by_provider[row["provider"]] = int(row["amount"])
        linked = int(
            conn.execute(
                "SELECT COUNT(DISTINCT account_id) FROM ("
                "SELECT left_account_id AS account_id FROM provider_account_links UNION "
                "SELECT right_account_id AS account_id FROM provider_account_links)"
            ).fetchone()[0]
        )
        quota_exhausted = int(conn.execute(
            "SELECT COUNT(DISTINCT account_id) FROM provider_account_quotas "
            "WHERE remaining=0 OR status='exhausted'"
        ).fetchone()[0])
        quota_unknown = int(conn.execute(
            "SELECT COUNT(DISTINCT account_id) FROM provider_account_quotas "
            "WHERE remaining IS NULL AND status IN ('unknown','')"
        ).fetchone()[0])
        failure_codes: dict[str, int] = {}
        for raw in conn.execute("SELECT metadata_json FROM provider_accounts"):
            try:
                metadata = json.loads(raw[0] or "{}")
            except (TypeError, json.JSONDecodeError):
                continue
            detection = metadata.get("detection") if isinstance(metadata, dict) else None
            if not isinstance(detection, dict) or detection.get("outcome") == "ok":
                continue
            code = str(detection.get("code") or "unknown").strip()[:120]
            failure_codes[code] = failure_codes.get(code, 0) + 1
        failure_codes = dict(sorted(failure_codes.items(), key=lambda item: (-item[1], item[0]))[:8])
        return {
            "total": total,
            "by_provider": by_provider,
            "routable_by_provider": routable_by_provider,
            "by_status": by_status,
            "with_credentials": with_credentials,
            "linked": linked,
            "theoretical_slots": theoretical_slots,
            "quota_exhausted": quota_exhausted,
            "quota_unknown": quota_unknown,
            "recent_failure_codes": failure_codes,
        }
