"""Build OAuth billing protocol and lossless Provider quota mapping."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

import httpx

from services.xai_cli_oauth_protocol import (
    XAI_CLI_BASE_URL,
    XAI_CLI_HEADERS,
    XAI_OAUTH_CLIENT_ID,
    XAI_TOKEN_URL,
    jwt_claims,
    token_expiry_epoch,
)

from .models import ProviderAccountQuota


class BuildBillingError(RuntimeError):
    def __init__(self, code: str, *, status_code: int = 0) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


class BuildBillingClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def fetch(self, access_token: str) -> dict[str, Any]:
        response = await self._client.get(
            f"{XAI_CLI_BASE_URL}/billing",
            params={"format": "credits"},
            headers=_headers(access_token),
        )
        _raise_status(response, "build_billing")
        return _json_object(response, "build_billing_json_invalid")

    async def subscription_tier(self, access_token: str) -> str:
        response = await self._client.get(
            f"{XAI_CLI_BASE_URL}/user",
            params={"include": "subscription"},
            headers=_headers(access_token),
        )
        _raise_status(response, "build_subscription")
        payload = _json_object(response, "build_subscription_json_invalid")
        return _text(payload.get("subscriptionTier") or payload.get("subscription_tier")) or _text(
            (payload.get("user") or {}).get("subscriptionTier")
            if isinstance(payload.get("user"), dict) else ""
        )

    async def refresh(self, refresh_token: str) -> dict[str, Any]:
        response = await self._client.post(
            XAI_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "client_id": XAI_OAUTH_CLIENT_ID,
                "refresh_token": refresh_token,
            },
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": XAI_CLI_HEADERS["User-Agent"],
            },
        )
        payload = _json_object(response, "build_oauth_refresh_json_invalid")
        access = _text(payload.get("access_token"))
        if response.status_code != 200 or not access:
            error = _text(payload.get("error"))
            code = "build_oauth_reauthorization_required" if error in {
                "invalid_grant", "invalid_token", "unauthorized_client",
            } or response.status_code in {400, 401, 403} else "build_oauth_refresh_rejected"
            raise BuildBillingError(code, status_code=response.status_code)
        return {
            "access_token": access,
            "refresh_token": _text(payload.get("refresh_token")) or refresh_token,
            "id_token": _text(payload.get("id_token")),
            "expires_at": token_expiry_epoch(access, fallback_seconds=int(payload.get("expires_in") or 21_600)),
        }


def billing_quota(
    account_id: str,
    payload: dict[str, Any],
    *,
    access_token: str,
    subscription_tier: str = "",
) -> ProviderAccountQuota:
    root = payload
    values = root.get("config") if isinstance(root.get("config"), dict) else root
    plan_code, plan_name = _plan_values(values)
    outer_code, outer_name = _plan_values(root)
    plan_code = plan_code or outer_code
    plan_name = plan_name or outer_name or _text(subscription_tier) or _jwt_tier(access_token)
    monthly_limit = _number(_first(values, "monthlyLimit", "monthly_limit"))
    used = _number(_first(values, "used", "totalUsed", "includedUsed"))
    on_demand_cap = _number(_first(values, "onDemandCap", "on_demand_cap", "maxAmountPerMonth"))
    on_demand_used = _number(_first(values, "onDemandUsed", "on_demand_used"))
    prepaid_balance = _number(_first(values, "prepaidBalance", "prepaid_balance"))
    usage_percent = _number(_first(values, "creditUsagePercent", "credit_usage_percent"))
    if usage_percent == 0:
        if on_demand_cap > 0:
            usage_percent = on_demand_used / on_demand_cap * 100
        elif monthly_limit > 0:
            usage_percent = used / monthly_limit * 100
    limit_value, remaining = _capacity(monthly_limit, used, on_demand_cap, on_demand_used)
    paid = _paid_plan(plan_code) or _paid_plan(plan_name) or any(
        value > 0 for value in (monthly_limit, on_demand_cap, on_demand_used, prepaid_balance)
    )
    status = "exhausted" if limit_value is not None and remaining == 0 else "available" if paid else "unknown"
    current_period = values.get("currentPeriod") if isinstance(values.get("currentPeriod"), dict) else {}
    usage_end = _text(current_period.get("end"))
    billing_end = _text(_first(values, "billingPeriodEnd", "billing_period_end"))
    checked_at = datetime.now(timezone.utc).isoformat()
    return ProviderAccountQuota(
        account_id=account_id,
        capability="billing",
        remaining=remaining,
        limit_value=limit_value,
        reset_at=usage_end if usage_percent >= 100 and usage_end else billing_end,
        checked_at=checked_at,
        status=status,
        metadata={
            "source": "build_billing", "plan_code": plan_code, "plan_name": plan_name,
            "monthly_limit": monthly_limit, "used": used,
            "on_demand_cap": on_demand_cap, "on_demand_used": on_demand_used,
            "prepaid_balance": prepaid_balance, "credit_usage_percent": usage_percent,
            "is_unified_billing_user": bool(_first(values, "isUnifiedBillingUser", "is_unified_billing_user")),
            "usage_period_end": usage_end, "billing_period_end": billing_end,
        },
    )


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}", "Accept": "application/json", **XAI_CLI_HEADERS}


def _raise_status(response: httpx.Response, prefix: str) -> None:
    if response.status_code == 200:
        return
    if response.status_code in {401, 403}:
        code = "build_oauth_reauthorization_required"
    elif response.status_code == 429:
        code = f"{prefix}_rate_limited"
    else:
        code = f"{prefix}_rejected"
    raise BuildBillingError(code, status_code=response.status_code)


def _json_object(response: httpx.Response, code: str) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise BuildBillingError(code, status_code=response.status_code) from exc
    if not isinstance(payload, dict):
        raise BuildBillingError(code, status_code=response.status_code)
    return payload


def _first(values: dict[str, Any], *keys: str) -> Any:
    return next((values[key] for key in keys if key in values), None)


def _text(value: object) -> str:
    return str(value or "").strip()


def _number(value: object) -> float:
    if isinstance(value, dict):
        value = value.get("val")
    if isinstance(value, bool) or value is None:
        return 0.0
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise BuildBillingError("build_billing_value_invalid") from exc
    if not math.isfinite(result) or result < 0:
        raise BuildBillingError("build_billing_value_invalid")
    return result


def _capacity(monthly: float, used: float, cap: float, cap_used: float) -> tuple[float | None, float | None]:
    if monthly > 0:
        return monthly, max(0.0, monthly - used)
    if cap > 0:
        return cap, max(0.0, cap - cap_used)
    return None, None


def _plan_values(values: dict[str, Any]) -> tuple[str, str]:
    code = _text(_first(values, "planCode", "plan_code", "tier"))
    name = _text(_first(values, "planName", "plan_name", "subscriptionName", "subscription_name", "subscriptionTier", "subscription_tier"))
    for key in ("plan", "subscription", "membership"):
        child = values.get(key)
        if isinstance(child, str):
            name = name or child.strip()
        elif isinstance(child, dict):
            code = code or _text(_first(child, "code", "id", "tier", "slug"))
            name = name or _text(_first(child, "name", "displayName", "display_name", "label"))
    return code, name


def _jwt_tier(token: str) -> str:
    value = jwt_claims(token).get("tier")
    names = {0: "free", 1: "supergrok", 2: "x_basic", 3: "x_premium", 4: "x_premium_plus", 5: "supergrok_heavy", 6: "supergrok_lite"}
    try:
        return names.get(int(value), "") if value is not None else ""
    except (TypeError, ValueError):
        return _text(value)


def _paid_plan(value: str) -> bool:
    normalized = _text(value).lower().replace(" ", "").replace("_", "").replace("-", "").replace("+", "plus")
    return normalized in {
        "super", "supergrok", "supergrokpro", "supergrokheavy", "supergroklite",
        "grokpro", "xpremium", "xpremiumplus", "apikey",
    }
