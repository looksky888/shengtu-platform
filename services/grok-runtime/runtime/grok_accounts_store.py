"""Lightweight Grok account pool store for shengtu grok-runtime.

Persists to DATA_DIR/grok_accounts.json. Independent of full register_service
so the pool UI works even when register imports fail.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR") or os.environ.get("GROK_RUNTIME_DATA_DIR") or "./data")


def _store_path() -> Path:
    return _data_dir() / "grok_accounts.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(value: object) -> str:
    return str(value or "").strip()


def _normalize_sso(value: object) -> str:
    token = _clean(value)
    if token.startswith("sso="):
        token = token[4:].split(";", 1)[0].strip()
    return token


class GrokAccountsStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()

    def _load(self) -> list[dict[str, Any]]:
        path = _store_path()
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
        if isinstance(raw, dict) and isinstance(raw.get("items"), list):
            return [x for x in raw["items"] if isinstance(x, dict)]
        if isinstance(raw, list):
            return [x for x in raw if isinstance(x, dict)]
        return []

    def _save(self, items: list[dict[str, Any]]) -> None:
        path = _store_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        payload = {"items": items, "updated_at": _now()}
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def _public(self, item: dict[str, Any]) -> dict[str, Any]:
        out = {
            "id": item.get("id") or "",
            "platform": "grok",
            "email": item.get("email") or "",
            "status": item.get("status") or "active",
            "source_type": item.get("source_type") or "manual",
            "created_at": item.get("created_at") or "",
            "updated_at": item.get("updated_at") or "",
            "disabled": bool(item.get("disabled")),
            "has_sso": bool(_normalize_sso(item.get("sso") or item.get("token"))),
            "note": item.get("note") or "",
            "use_count": int(item.get("use_count") or 0),
            "fail_count": int(item.get("fail_count") or 0),
            "last_used_at": item.get("last_used_at") or "",
            "refresh_status": item.get("refresh_status") or "",
            "refresh_error": item.get("refresh_error") or "",
        }
        return out

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        keyword: str = "",
        status: str = "all",
    ) -> dict[str, Any]:
        with self._lock:
            items = self._load()
        kw = _clean(keyword).lower()
        st = _clean(status).lower() or "all"
        filtered: list[dict[str, Any]] = []
        for item in items:
            if st not in ("", "all"):
                item_st = _clean(item.get("status")).lower() or "active"
                if item.get("disabled") and st == "disabled":
                    pass
                elif st == "disabled" and not item.get("disabled"):
                    continue
                elif st != "disabled" and item_st != st:
                    continue
            if kw:
                blob = " ".join(
                    _clean(item.get(k)).lower()
                    for k in ("id", "email", "source_type", "status", "note")
                )
                if kw not in blob:
                    continue
            filtered.append(item)

        total = len(filtered)
        all_total = len(items)
        page = max(1, int(page or 1))
        page_size = min(500, max(1, int(page_size or 50)))
        start = (page - 1) * page_size
        page_items = filtered[start : start + page_size]
        summary = {
            "total": all_total,
            "active": sum(1 for x in items if not x.get("disabled") and (_clean(x.get("status")) or "active") == "active"),
            "disabled": sum(1 for x in items if x.get("disabled")),
            "pending_sso": sum(1 for x in items if (_clean(x.get("status")) or "") == "pending_sso"),
        }
        return {
            "items": [self._public(x) for x in page_items],
            "count": total,
            "total": total,
            "all_total": all_total,
            "page": page,
            "page_size": page_size,
            "summary": summary,
            "runtime_available": True,
            "runtime_error": "",
        }

    def import_tokens(
        self,
        tokens: list[str] | None = None,
        accounts: list[dict[str, Any]] | None = None,
        *,
        source_type: str = "manual",
    ) -> dict[str, Any]:
        tokens = tokens or []
        accounts = accounts or []
        added = 0
        skipped = 0
        errors: list[dict[str, str]] = []
        with self._lock:
            items = self._load()
            by_sso = {_normalize_sso(x.get("sso") or x.get("token")): x for x in items}
            for raw in tokens:
                sso = _normalize_sso(raw)
                if not sso:
                    skipped += 1
                    continue
                if sso in by_sso:
                    skipped += 1
                    continue
                row = {
                    "id": "grok_" + uuid.uuid4().hex[:16],
                    "sso": sso,
                    "token": sso,
                    "email": "",
                    "status": "active",
                    "source_type": source_type,
                    "created_at": _now(),
                    "updated_at": _now(),
                    "disabled": False,
                    "use_count": 0,
                    "fail_count": 0,
                }
                items.append(row)
                by_sso[sso] = row
                added += 1
            for acc in accounts:
                if not isinstance(acc, dict):
                    skipped += 1
                    continue
                sso = _normalize_sso(acc.get("sso") or acc.get("token") or acc.get("access_token"))
                if not sso:
                    errors.append({"error": "missing sso/token"})
                    skipped += 1
                    continue
                if sso in by_sso:
                    skipped += 1
                    continue
                row = {
                    "id": "grok_" + uuid.uuid4().hex[:16],
                    "sso": sso,
                    "token": sso,
                    "email": _clean(acc.get("email")),
                    "status": _clean(acc.get("status")) or "active",
                    "source_type": _clean(acc.get("source_type")) or source_type,
                    "note": _clean(acc.get("note")),
                    "created_at": _now(),
                    "updated_at": _now(),
                    "disabled": bool(acc.get("disabled")),
                    "use_count": 0,
                    "fail_count": 0,
                }
                items.append(row)
                by_sso[sso] = row
                added += 1
            self._save(items)
        return {"added": added, "skipped": skipped, "errors": errors, "total": added + skipped}

    def delete_ids(self, ids: list[str]) -> dict[str, Any]:
        id_set = {_clean(x) for x in ids if _clean(x)}
        if not id_set:
            return {"deleted": 0}
        with self._lock:
            items = self._load()
            keep = [x for x in items if _clean(x.get("id")) not in id_set]
            deleted = len(items) - len(keep)
            self._save(keep)
        return {"deleted": deleted}

    def set_disabled(self, ids: list[str], disabled: bool) -> dict[str, Any]:
        id_set = {_clean(x) for x in ids if _clean(x)}
        updated = 0
        with self._lock:
            items = self._load()
            for item in items:
                if _clean(item.get("id")) in id_set:
                    item["disabled"] = bool(disabled)
                    item["status"] = "disabled" if disabled else "active"
                    item["updated_at"] = _now()
                    updated += 1
            self._save(items)
        return {"updated": updated, "disabled": bool(disabled)}

    def raw_for_runtime(self) -> list[dict[str, Any]]:
        """Full records for native image dispatch (includes sso)."""
        with self._lock:
            return list(self._load())

    def export_public(self, *, include_sso: bool = False) -> list[dict[str, Any]]:
        with self._lock:
            items = self._load()
        out: list[dict[str, Any]] = []
        for item in items:
            row = self._public(item)
            if include_sso:
                sso = _normalize_sso(item.get("sso") or item.get("token"))
                if sso:
                    # mask middle for UI-safe export default
                    if len(sso) > 12:
                        row["sso_preview"] = sso[:6] + "…" + sso[-4:]
                    else:
                        row["sso_preview"] = "***"
                    row["sso"] = sso  # full only when explicitly requested
            out.append(row)
        return out


store = GrokAccountsStore()
