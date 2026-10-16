"""Work around libcurl CA path issues on Windows with non-ASCII paths.

curl_cffi / libcurl load certifi's cacert.pem by path. When the virtualenv lives
under a path that contains non-ASCII characters (e.g. Chinese), Windows libcurl
often fails with:

  curl: (77) error setting certificate verify locations: CAfile: ...

Copy the bundle to an ASCII-only directory and point certifi + common env vars
at that copy before any HTTPS client is created.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path


_DEFAULT_ASCII_CERT_DIR = r"D:\BaiduNetdiskDownload\gptgrok2api-certs"
_applied = False


def _is_ascii_path(path: str) -> bool:
    try:
        path.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def ensure_ascii_ssl_cert() -> str | None:
    """Ensure SSL CA bundle is reachable via an ASCII path. Returns the path used."""
    global _applied
    if _applied:
        return os.environ.get("SSL_CERT_FILE") or None

    try:
        import certifi
    except Exception:
        _applied = True
        return None

    try:
        src = Path(certifi.where())
        if not src.is_file():
            _applied = True
            return None

        if _is_ascii_path(str(src)):
            path = str(src)
        else:
            dest_root = Path(
                os.environ.get("GPTGROK_CERT_DIR")
                or os.environ.get("CHATGPT2API_CERT_DIR")
                or _DEFAULT_ASCII_CERT_DIR
            )
            if not _is_ascii_path(str(dest_root)):
                # Last resort: user profile is usually ASCII on this machine.
                dest_root = Path(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")) / "gptgrok2api-certs"
            dest_root.mkdir(parents=True, exist_ok=True)
            dest = dest_root / "cacert.pem"
            need_copy = True
            if dest.is_file():
                try:
                    need_copy = dest.stat().st_size != src.stat().st_size
                except OSError:
                    need_copy = True
            if need_copy:
                shutil.copy2(src, dest)
            path = str(dest)

        for key in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
            os.environ[key] = path

        # curl_cffi defaults to certifi.where() when verify=True; patch it so
        # sessions with trust_env=False still get an ASCII path.
        certifi.where = lambda: path  # type: ignore[method-assign]
        _applied = True
        return path
    except Exception:
        _applied = True
        return None
