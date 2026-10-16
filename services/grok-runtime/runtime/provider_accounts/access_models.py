"""Credential and egress access values returned by the managed repository."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EncryptedProviderCredential:
    account_id: str
    provider: str
    auth_type: str
    encrypted_primary: str
    encrypted_refresh: str
    encrypted_id_token: str
    encrypted_clearance: str
    key_version: int


@dataclass(frozen=True, slots=True)
class ProviderAccountEgressAccess:
    mode: str
    identity: str
    encrypted_proxy: str
    key_version: int
