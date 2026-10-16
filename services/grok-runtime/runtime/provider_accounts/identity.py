"""Stable, credential-free identities shared by projection and conversion."""

from __future__ import annotations

import hashlib


def clean_text(value: object) -> str:
    return str(value or "").strip()


def normalize_sso(value: object) -> str:
    token = "".join(clean_text(value).split())
    if token.lower().startswith("sso="):
        token = token[4:].split(";", 1)[0].strip()
    return token


def source_fingerprint(kind: str, value: object) -> str:
    normalized = clean_text(value)
    if not normalized:
        return ""
    return hashlib.sha256(f"{kind}\0{normalized}".encode("utf-8")).hexdigest()


def web_account_id(fingerprint: str) -> str:
    return f"web-{fingerprint[:24]}"


def console_account_id(fingerprint: str) -> str:
    return f"console-{fingerprint[:24]}"


def build_account_id(fingerprint: str) -> str:
    return f"build-{fingerprint[:24]}"
