"""Validate challenge results without exposing challenge contents in diagnostics."""
import base64
import binascii
import re


def validate_turnstile_token(token: object, seed: str) -> str:
    if not isinstance(token, str) or not token or len(token) > 262144:
        return "invalid_challenge_result"
    if token == seed:
        return "challenge_seed_echo"
    if token in {"undefined", "null"} or token.startswith("ERR:"):
        return "challenge_module_error"
    if token.isdigit():
        return "challenge_vm_timeout"
    try:
        decoded = base64.b64decode(token + "===").decode("utf-8", "replace")
    except (ValueError, binascii.Error):
        decoded = ""  # Reject known failure envelopes, not an undocumented token alphabet.
    if re.match(r"^\d+: ", decoded):
        return "challenge_vm_error"
    return ""
