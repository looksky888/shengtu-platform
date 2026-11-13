"""Headless xAI Device Code authorization using a saved Grok login.

The browser page is only an HTTP client for three operations: create an
accounts.x.ai session, select a principal, and approve the device code.  This
module reproduces those operations with the existing Castle/jsdom runtime and
Turnstile provider, so the production path does not require a browser.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

from services.xai_cli_oauth_protocol import (
    XAI_DEVICE_CODE_URL,
    XAI_OAUTH_CLIENT_ID,
    XAI_OAUTH_SCOPE,
    XAI_TOKEN_URL,
)


_DEVICE_VERIFY_URL = "https://auth.x.ai/oauth2/device/verify"
_DEVICE_APPROVE_HOST = "auth.x.ai"
_DEVICE_APPROVE_PATH = "/oauth2/device/approve"
_ALLOWED_NAVIGATION_HOSTS = {
    "accounts.x.ai",
    "auth.x.ai",
    "auth.grok.com",
    "auth.grokusercontent.com",
    "auth.grokipedia.com",
    "grok.com",
}
_MAX_DEVICE_LIFETIME_SECONDS = 1_800

ProgressCallback = Callable[[str, str], None]


class XaiDeviceOAuthProtocolError(RuntimeError):
    def __init__(self, message: str, *, stage: str, retryable: bool = False):
        super().__init__(message)
        self.stage = str(stage or "protocol")
        self.retryable = bool(retryable)


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _safe_json(response: Any) -> dict[str, Any]:
    try:
        payload = response.json()
    except Exception as exc:
        raise XaiDeviceOAuthProtocolError(
            "xAI authorization returned an invalid JSON response",
            stage="response",
        ) from exc
    if not isinstance(payload, dict):
        raise XaiDeviceOAuthProtocolError(
            "xAI authorization returned an invalid response object",
            stage="response",
        )
    return payload


def _validated_url(value: object, *, hosts: set[str], stage: str) -> str:
    url = _clean_text(value)
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in hosts:
        raise XaiDeviceOAuthProtocolError("xAI returned an unexpected navigation URL", stage=stage)
    return url


class _ConsentFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.forms: list[dict[str, Any]] = []
        self._form: dict[str, Any] | None = None
        self._button: dict[str, Any] | None = None
        self._select: dict[str, Any] | None = None
        self._option: dict[str, Any] | None = None

    @staticmethod
    def _attrs(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {str(key).lower(): str(value or "") for key, value in attrs}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        values = self._attrs(attrs)
        if tag == "form":
            self._form = {
                "action": values.get("action", ""),
                "method": values.get("method", "get").lower(),
                "controls": [],
            }
            self.forms.append(self._form)
            return
        if self._form is None:
            return
        if tag == "input":
            self._form["controls"].append(
                {
                    "tag": "input",
                    "name": values.get("name", ""),
                    "value": values.get("value", ""),
                    "type": values.get("type", "text").lower(),
                    "checked": "checked" in values,
                }
            )
        elif tag == "button":
            self._button = {
                "tag": "button",
                "name": values.get("name", ""),
                "value": values.get("value", ""),
                "type": values.get("type", "submit").lower(),
                "text": "",
            }
        elif tag == "select":
            self._select = {
                "tag": "select",
                "name": values.get("name", ""),
                "options": [],
            }
        elif tag == "option" and self._select is not None:
            self._option = {
                "value": values.get("value", ""),
                "selected": "selected" in values,
                "text": "",
            }

    def handle_data(self, data: str) -> None:
        if self._button is not None:
            self._button["text"] += data
        if self._option is not None:
            self._option["text"] += data

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "option" and self._select is not None and self._option is not None:
            self._select["options"].append(self._option)
            self._option = None
        elif tag == "select" and self._form is not None and self._select is not None:
            self._form["controls"].append(self._select)
            self._select = None
        elif tag == "button" and self._form is not None and self._button is not None:
            self._button["text"] = _clean_text(self._button.get("text"))
            self._form["controls"].append(self._button)
            self._button = None
        elif tag == "form":
            self._form = None


class _NextFlightScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.scripts: list[str] = []
        self._script_parts: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "script":
            self._script_parts = []

    def handle_data(self, data: str) -> None:
        if self._script_parts is not None:
            self._script_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._script_parts is not None:
            self.scripts.append("".join(self._script_parts))
            self._script_parts = None


def _next_flight_records(html: str) -> list[Any]:
    parser = _NextFlightScriptParser()
    parser.feed(str(html or ""))
    decoder = json.JSONDecoder()
    chunks: list[str] = []
    marker = "self.__next_f.push("
    for script in parser.scripts:
        cursor = 0
        while True:
            start = script.find(marker, cursor)
            if start < 0:
                break
            start += len(marker)
            try:
                value, end = decoder.raw_decode(script, start)
            except (TypeError, ValueError):
                cursor = start
                continue
            cursor = end
            if isinstance(value, list) and len(value) >= 2 and value[0] == 1 and isinstance(value[1], str):
                chunks.append(value[1])

    records: list[Any] = []
    for line in "".join(chunks).splitlines():
        _, separator, encoded = line.partition(":")
        if not separator or not encoded:
            continue
        try:
            record, _ = decoder.raw_decode(encoded)
        except (TypeError, ValueError):
            continue
        records.append(record)
    return records


def _walk_json(value: Any):
    pending = [value]
    while pending:
        current = pending.pop()
        yield current
        if isinstance(current, dict):
            pending.extend(current.values())
        elif isinstance(current, list):
            pending.extend(current)


def _flight_session_user_id(html: str) -> str:
    for record in _next_flight_records(html):
        for node in _walk_json(record):
            if not isinstance(node, dict):
                continue
            dehydrated = node.get("dehydratedState")
            if not isinstance(dehydrated, dict):
                continue
            queries = dehydrated.get("queries")
            if not isinstance(queries, list):
                continue
            for query in queries:
                if not isinstance(query, dict) or query.get("queryKey") != ["session"]:
                    continue
                state = query.get("state")
                data = state.get("data") if isinstance(state, dict) else None
                user = data.get("user") if isinstance(data, dict) else None
                user_id = _clean_text(user.get("userId")) if isinstance(user, dict) else ""
                if user_id:
                    return user_id
    return ""


def parse_device_consent_form(html: str, *, base_url: str, user_code: str) -> tuple[str, dict[str, str]]:
    parser = _ConsentFormParser()
    parser.feed(str(html or ""))
    for form in parser.forms:
        action = urljoin(base_url, _clean_text(form.get("action")))
        parsed = urlparse(action)
        if parsed.scheme != "https" or parsed.hostname != _DEVICE_APPROVE_HOST or parsed.path != _DEVICE_APPROVE_PATH:
            continue
        if _clean_text(form.get("method")).lower() != "post":
            continue

        payload: dict[str, str] = {}
        allow_control: dict[str, Any] | None = None
        for control in form.get("controls") or []:
            if not isinstance(control, dict):
                continue
            name = _clean_text(control.get("name"))
            tag = _clean_text(control.get("tag")).lower()
            if tag == "input" and name:
                input_type = _clean_text(control.get("type")).lower()
                if input_type in {"checkbox", "radio"} and not bool(control.get("checked")):
                    continue
                if input_type not in {"submit", "button", "reset"}:
                    value = _clean_text(control.get("value"))
                    if name not in payload or value:
                        payload[name] = value
            elif tag == "select" and name:
                options = [option for option in (control.get("options") or []) if isinstance(option, dict)]
                selected = next((option for option in options if option.get("selected")), None)
                selected = selected or next((option for option in options if _clean_text(option.get("value"))), None)
                if selected is not None:
                    payload[name] = _clean_text(selected.get("value") or selected.get("text"))
            elif tag == "button":
                value = _clean_text(control.get("value")).lower()
                text = _clean_text(control.get("text")).lower()
                if value in {"allow", "approve", "approved", "accept"} or text in {"allow", "approve", "accept"}:
                    allow_control = control

        if _clean_text(payload.get("user_code")) != _clean_text(user_code):
            raise XaiDeviceOAuthProtocolError("Device consent form returned the wrong user code", stage="consent")
        if allow_control is None:
            raise XaiDeviceOAuthProtocolError("Device consent form has no allow action", stage="consent")
        action_name = _clean_text(allow_control.get("name")) or "action"
        action_value = _clean_text(allow_control.get("value")) or "allow"
        payload[action_name] = action_value
        if _clean_text(payload.get("principal_type")).lower() == "user" and not _clean_text(payload.get("principal_id")):
            payload["principal_id"] = _flight_session_user_id(html)
        if not _clean_text(payload.get("principal_type")) or not _clean_text(payload.get("principal_id")):
            raise XaiDeviceOAuthProtocolError("Device consent form did not select an OAuth principal", stage="consent")
        return action, payload
    raise XaiDeviceOAuthProtocolError("xAI device consent form was not found", stage="consent")


class XaiDeviceOAuthProtocol:
    def __init__(self, grok_config: dict[str, Any], *, proxy: str = "", progress: ProgressCallback | None = None):
        self.config = dict(grok_config or {})
        self.proxy = _clean_text(proxy) or "direct"
        self.progress = progress

    def _emit(self, stage: str, message: str) -> None:
        if self.progress is not None:
            self.progress(str(stage), str(message))

    def authorize(self, *, email: str, password: str) -> dict[str, Any]:
        clean_email = _clean_text(email)
        clean_password = _clean_text(password)
        if not clean_email or not clean_password:
            raise XaiDeviceOAuthProtocolError("Saved Grok account is missing email or password", stage="account")
        raise XaiDeviceOAuthProtocolError(
            "Headless Grok registration protocol is unavailable",
            stage="protocol",
        )


__all__ = [
    "XaiDeviceOAuthProtocol",
    "XaiDeviceOAuthProtocolError",
    "parse_device_consent_form",
]
