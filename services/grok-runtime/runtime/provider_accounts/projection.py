"""Build a safe provider-account projection from the three legacy sources."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .identity import clean_text as _clean
from .identity import normalize_sso as _normalize_sso
from .identity import source_fingerprint as _fingerprint
from .identity import web_account_id
from .models import ProviderAccount, ProviderName
from .repository import ProviderAccountRepository


class ProjectionSourceError(RuntimeError):
    def __init__(self, source: str, code: str) -> None:
        super().__init__(f"{source}: {code}")
        self.source = source
        self.code = code


@dataclass(frozen=True, slots=True)
class ProjectionPaths:
    web_archive: Path
    native_database: Path
    build_oauth: Path


def _mask_email(value: object) -> str:
    local, separator, domain = _clean(value).partition("@")
    if not separator or not local or not domain:
        return ""
    if len(local) <= 2:
        return f"{local[:1]}***@{domain}"
    return f"{local[:2]}***{local[-1:]}@{domain}"


def _iso_from_millis(value: object) -> str:
    try:
        timestamp = int(value) / 1000
    except (TypeError, ValueError, OverflowError):
        return ""
    try:
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
    except (OSError, OverflowError, ValueError):
        return ""


def _non_negative_int(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError, OverflowError):
        return 0


def _read_items(path: Path, source: str) -> tuple[list[dict[str, Any]], str]:
    if not path.exists():
        return [], "missing"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ProjectionSourceError(source, "source_unreadable") from exc
    if isinstance(payload, dict):
        payload = payload.get("items")
    if not isinstance(payload, list) or any(not isinstance(item, dict) for item in payload):
        raise ProjectionSourceError(source, "source_schema_invalid")
    return [dict(item) for item in payload], "ok"


def _read_native(path: Path) -> tuple[list[dict[str, Any]], str]:
    if not path.exists():
        return [], "missing"
    try:
        with sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True, timeout=5) as conn:
            conn.row_factory = sqlite3.Row
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "accounts" not in tables:
                return [], "schema_missing"
            columns = {row[1] for row in conn.execute("PRAGMA table_info(accounts)")}
            wanted = [
                name for name in (
                    "token", "pool", "status", "updated_at", "usage_use_count",
                    "usage_fail_count", "last_use_at", "last_fail_at", "deleted_at",
                ) if name in columns
            ]
            if "token" not in wanted:
                raise ProjectionSourceError("native_runtime", "token_column_missing")
            query = f"SELECT {','.join(wanted)} FROM accounts"
            if "deleted_at" in columns:
                query += " WHERE deleted_at IS NULL"
            return [dict(row) for row in conn.execute(query)], "ok"
    except ProjectionSourceError:
        raise
    except sqlite3.Error as exc:
        raise ProjectionSourceError("native_runtime", "database_unreadable") from exc


def _account_status(value: object, *, disabled: bool = False) -> str:
    status = _clean(value).lower()
    if disabled or status == "disabled":
        return "disabled"
    if status in {"expired", "invalid"}:
        return "error"
    if status in {"active", "cooling"}:
        return "active"
    return "unknown"


def _web_capabilities(pool: str) -> tuple[str, ...]:
    capabilities = ["text", "image", "image_edit"]
    if pool in {"super", "heavy"}:
        capabilities.append("video")
    return tuple(capabilities)


def _build_capabilities(models: list[str]) -> tuple[str, ...]:
    capabilities: list[str] = []
    if any("grok" in model.lower() and "video" not in model.lower() for model in models):
        capabilities.append("text")
    if any("video" in model.lower() for model in models):
        capabilities.append("video")
    return tuple(capabilities)


class ProviderProjectionService:
    def __init__(self, paths: ProjectionPaths, repository: ProviderAccountRepository) -> None:
        self._paths = paths
        self._repository = repository

    def refresh(self) -> dict[str, Any]:
        started_at = datetime.now(timezone.utc).isoformat()
        try:
            web_rows, web_state = _read_items(self._paths.web_archive, "web_archive")
            native_rows, native_state = _read_native(self._paths.native_database)
            build_rows, build_state = _read_items(self._paths.build_oauth, "build_oauth")
            accounts, consistency, warnings = self._project(web_rows, native_rows, build_rows)
            source_counts = {
                "web_archive": len(web_rows),
                "native_runtime": len(native_rows),
                "build_oauth": len(build_rows),
                "console": 0,
            }
            sources = {
                "web_archive": web_state,
                "native_runtime": native_state,
                "build_oauth": build_state,
                "console": "not_configured",
            }
            warnings.extend(f"{name}:{state}" for name, state in sources.items() if state != "ok")
            run = self._repository.replace_projection(
                accounts,
                source_counts=source_counts,
                warnings=warnings,
                started_at=started_at,
            )
            return {**run, "sources": sources, "consistency": consistency}
        except ProjectionSourceError as exc:
            self._repository.record_failure(exc.code, started_at=started_at, warnings=[exc.source])
            raise

    @staticmethod
    def _project(
        web_rows: list[dict[str, Any]],
        native_rows: list[dict[str, Any]],
        build_rows: list[dict[str, Any]],
    ) -> tuple[list[ProviderAccount], dict[str, int], list[str]]:
        warnings: list[str] = []
        native_by_fingerprint: dict[str, dict[str, Any]] = {}
        for item in native_rows:
            fingerprint = _fingerprint("web-sso", _normalize_sso(item.get("token")))
            if fingerprint:
                native_by_fingerprint[fingerprint] = item

        projected: dict[str, ProviderAccount] = {}
        matched_native: set[str] = set()
        archive_without_sso = 0
        for index, item in enumerate(web_rows):
            token = _normalize_sso(item.get("sso") or item.get("token"))
            fingerprint = _fingerprint("web-sso", token)
            if not fingerprint:
                archive_without_sso += 1
                identity = _clean(item.get("id")) or _clean(item.get("email"))
                fingerprint = _fingerprint("web-record", identity)
            if not fingerprint:
                warnings.append(f"web_archive:identity_missing:{index}")
                continue
            native = native_by_fingerprint.get(fingerprint, {})
            if native:
                matched_native.add(fingerprint)
            pool = _clean(native.get("pool")) or "unknown"
            status = _account_status(
                native.get("status") or item.get("status"),
                disabled=bool(item.get("disabled")),
            )
            account_id = web_account_id(fingerprint)
            projected[fingerprint] = ProviderAccount(
                id=account_id,
                provider=ProviderName.WEB,
                source_fingerprint=fingerprint,
                projection_source="legacy_web",
                status=status,
                source_type=_clean(item.get("source_type")) or "legacy_archive",
                display_name=_mask_email(item.get("email")) or account_id,
                email_masked=_mask_email(item.get("email")),
                credential_kind="sso",
                has_credential=bool(token),
                capabilities=_web_capabilities(pool),
                metadata={
                    "pool": pool,
                    "runtime_present": bool(native),
                    "use_count": _non_negative_int(native.get("usage_use_count") or item.get("use_count")),
                    "fail_count": _non_negative_int(native.get("usage_fail_count") or item.get("fail_count")),
                },
                source_created_at=_clean(item.get("created_at")),
                source_updated_at=_iso_from_millis(native.get("updated_at")) or _clean(item.get("updated_at")),
            )

        for fingerprint, native in native_by_fingerprint.items():
            if fingerprint in projected:
                continue
            pool = _clean(native.get("pool")) or "unknown"
            account_id = web_account_id(fingerprint)
            projected[fingerprint] = ProviderAccount(
                id=account_id,
                provider=ProviderName.WEB,
                source_fingerprint=fingerprint,
                projection_source="legacy_web",
                status=_account_status(native.get("status")),
                source_type="runtime",
                display_name=account_id,
                credential_kind="sso",
                has_credential=True,
                capabilities=_web_capabilities(pool),
                metadata={
                    "pool": pool,
                    "runtime_present": True,
                    "use_count": _non_negative_int(native.get("usage_use_count")),
                    "fail_count": _non_negative_int(native.get("usage_fail_count")),
                },
                source_updated_at=_iso_from_millis(native.get("updated_at")),
            )

        build_accounts: list[ProviderAccount] = []
        for index, item in enumerate(build_rows):
            identity = _clean(item.get("subject")) or _clean(item.get("id")) or _clean(item.get("email"))
            if not identity:
                identity = _clean(item.get("access_token"))
            fingerprint = _fingerprint("build-oauth", identity)
            if not fingerprint:
                warnings.append(f"build_oauth:identity_missing:{index}")
                continue
            model_values = item.get("models") if isinstance(item.get("models"), list) else []
            models = list(dict.fromkeys(_clean(model) for model in model_values if _clean(model)))
            account_id = f"build-{fingerprint[:24]}"
            build_accounts.append(
                ProviderAccount(
                    id=account_id,
                    provider=ProviderName.BUILD,
                    source_fingerprint=fingerprint,
                    projection_source="legacy_build",
                    status=_account_status(item.get("status")),
                    source_type=_clean(item.get("source_type")) or "oauth_import",
                    display_name=_mask_email(item.get("email")) or account_id,
                    email_masked=_mask_email(item.get("email")),
                    credential_kind="oauth",
                    has_credential=bool(_clean(item.get("access_token")) and _clean(item.get("refresh_token"))),
                    capabilities=_build_capabilities(models),
                    metadata={
                        "models": models,
                        "use_count": _non_negative_int(item.get("use_count")),
                        "fail_count": _non_negative_int(item.get("fail_count")),
                    },
                    source_created_at=_clean(item.get("created_at")),
                    source_updated_at=_clean(item.get("updated_at")),
                )
            )

        consistency = {
            "web_projected": len(projected),
            "web_archive_runtime_matched": len(matched_native),
            "web_archive_without_sso": archive_without_sso,
            "native_orphans": len(native_by_fingerprint) - len(matched_native),
            "build_projected": len(build_accounts),
            "build_unlinked": len(build_accounts),
            "console_projected": 0,
        }
        return [*projected.values(), *build_accounts], consistency, warnings
